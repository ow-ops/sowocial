import { accountHash, tokenHash } from '@/push/payload';

describe('accountHash', () => {
  it('hashes a fediverse token exactly as before', () => {
    expect(accountHash({ token: 'secret' })).toBe(tokenHash('secret'));
  });

  it('hashes a Bluesky DID, which the relay names in its pushes', () => {
    expect(accountHash({ did: 'did:plc:abc' })).toBe(tokenHash('did:plc:abc'));
    expect(accountHash({ did: 'did:plc:abc' })).not.toBe(accountHash({ did: 'did:plc:abd' }));
  });
});
