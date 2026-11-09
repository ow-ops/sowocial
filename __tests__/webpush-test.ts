import { p256 } from '@noble/curves/nist.js';

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
