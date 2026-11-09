import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

// RFC 8291 message encryption for Web Push (`aes128gcm`, RFC 8188), receiving side.

export type PushKeys = {
  privateKey: Uint8Array;
  // Uncompressed 65-byte P-256 point.
  publicKey: Uint8Array;
  // 16 random bytes.
  auth: Uint8Array;
};

const text = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromBase64(value: string) {
  const standard = value.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function createPushKeys(randomBytes: (length: number) => Uint8Array): PushKeys {
  const { secretKey } = p256.keygen(randomBytes(48));
  return { privateKey: secretKey, publicKey: p256.getPublicKey(secretKey, false), auth: randomBytes(16) };
}

// Throws when the message was not encrypted to these keys or is malformed.
export function decryptWebPush(body: Uint8Array, keys: PushKeys): string {
  const salt = body.subarray(0, 16);
  if (body.length < 21) throw new Error('Malformed Web Push message');
  const idLength = body[20];
  const serverKey = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);
  if (idLength !== 65 || ciphertext.length < 17) throw new Error('Malformed Web Push message');

  const ecdh = p256.getSharedSecret(keys.privateKey, serverKey, true).subarray(1);
  const keyInfo = concat(text('WebPush: info\0'), keys.publicKey, serverKey);
  const ikm = hkdf(sha256, ecdh, keys.auth, keyInfo, 32);
  const cek = hkdf(sha256, ikm, salt, text('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(sha256, ikm, salt, text('Content-Encoding: nonce\0'), 12);

  // A single record: the plaintext ends with the 0x02 delimiter and optional zero padding.
  const padded = gcm(cek, nonce).decrypt(ciphertext);
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 2) throw new Error('Web Push message is not a single final record');
  return new TextDecoder().decode(padded.subarray(0, end));
}
