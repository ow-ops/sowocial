import { gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { base64url, createPushKeys, decryptWebPush, fromBase64 } from '@/push/webpush';

// RFC 8291 Appendix A.
const rfc = {
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ',
};

const keys = {
  privateKey: fromBase64(rfc.uaPrivate),
  publicKey: fromBase64(rfc.uaPublic),
  auth: fromBase64(rfc.auth),
};

describe('decryptWebPush', () => {
  it('decrypts the RFC 8291 example', () => {
    const body = new Uint8Array([...fromBase64(rfc.header), ...fromBase64(rfc.ciphertext)]);
    expect(body).toHaveLength(86 + 58);
    expect(decryptWebPush(body, keys)).toBe('When I grow up, I want to be a watermelon');
  });

  it('refuses a message for other keys', () => {
    const body = new Uint8Array([...fromBase64(rfc.header), ...fromBase64(rfc.ciphertext)]);
    const other = createPushKeys((n) => new Uint8Array(n).fill(7));
    expect(() => decryptWebPush(body, other)).toThrow();
  });
});

describe('createPushKeys', () => {
  it('makes an uncompressed P-256 key pair and a 16-byte auth secret', () => {
    let next = 1;
    const keys = createPushKeys((n) => Uint8Array.from({ length: n }, () => next++ % 251));
    expect(keys.publicKey).toHaveLength(65);
    expect(keys.publicKey[0]).toBe(4);
    expect(base64url(keys.publicKey)).toBe(base64url(p256.getPublicKey(keys.privateKey, false)));
    expect(keys.auth).toHaveLength(16);
  });
});

describe('decryptWebPush padding', () => {
  const text = (s: string) => new TextEncoder().encode(s);
  const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));

  function encrypt(plain: Uint8Array, to: ReturnType<typeof createPushKeys>) {
    const server = p256.keygen();
    const salt = new Uint8Array(16).fill(3);
    const serverKey = p256.getPublicKey(server.secretKey, false);
    const ecdh = p256.getSharedSecret(server.secretKey, to.publicKey, true).subarray(1);
    const ikm = hkdf(sha256, ecdh, to.auth, concat(text('WebPush: info\0'), to.publicKey, serverKey), 32);
    const cek = hkdf(sha256, ikm, salt, text('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(sha256, ikm, salt, text('Content-Encoding: nonce\0'), 12);
    const header = concat(salt, new Uint8Array([0, 0, 16, 0, 65]), serverKey);
    return concat(header, gcm(cek, nonce).encrypt(plain));
  }

  const recipient = createPushKeys((n) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 1) % 251));

  it('strips zero padding after the final delimiter', () => {
    const body = encrypt(concat(text('hi'), new Uint8Array([2, 0, 0, 0])), recipient);
    expect(decryptWebPush(body, recipient)).toBe('hi');
  });

  it('refuses a record not marked final', () => {
    const body = encrypt(concat(text('hi'), new Uint8Array([1])), recipient);
    expect(() => decryptWebPush(body, recipient)).toThrow('single final record');
  });

  it('refuses a truncated body', () => {
    expect(() => decryptWebPush(new Uint8Array(10), recipient)).toThrow('Malformed');
  });
});
