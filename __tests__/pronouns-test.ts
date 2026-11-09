import type { mastodon } from 'masto';

import { toAuthor as apAuthor } from '@/model/adapters/ap';
import { toAuthor as bskyAuthor } from '@/model/adapters/bsky';

import alice from './fixtures/account-local.json';

const fields = (...list: [string, string][]) =>
  apAuthor({ ...alice, fields: list.map(([name, value]) => ({ name, value, verifiedAt: null })) } as unknown as mastodon.v1.Account)
    .pronouns;

describe('pronouns', () => {
  it('reads a fediverse profile field labelled pronouns', () => {
    expect(fields(['Site', 'a.example'], ['Pronouns', 'she/her'])).toBe('she/her');
  });

  it('matches translated labels and ignores emoji and case', () => {
    expect(fields(['Pronoms', 'il/lui'])).toBe('il/lui');
    expect(fields(['🏳️‍🌈 PRONOMEN:', 'sie/ihr'])).toBe('sie/ihr');
  });

  it('strips html from the value', () => {
    expect(fields(['Pronouns', '<p>they/them</p>'])).toBe('they/them');
  });

  it('skips missing, empty and overlong values', () => {
    expect(fields(['Site', 'a.example'])).toBeUndefined();
    expect(fields(['Pronouns', ' '])).toBeUndefined();
    expect(fields(['Pronouns', 'any pronouns are fine as long as you are kind to me please'])).toBeUndefined();
  });

  it('reads the native Bluesky field', () => {
    expect(bskyAuthor({ did: 'did:plc:a', handle: 'a.test', pronouns: ' he/him ' }).pronouns).toBe('he/him');
    expect(bskyAuthor({ did: 'did:plc:a', handle: 'a.test' }).pronouns).toBeUndefined();
  });
});
