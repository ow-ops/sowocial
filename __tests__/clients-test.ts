import type { Agent } from '@atproto/api';

import { accountOfPost, forgetMasto, getAgent, getMasto, isForeign, mastoFor } from '@/api/clients';
import type { Session } from '@/auth/types';
import type { Post } from '@/model/post';

import { bskyPost } from './fixtures/bsky-agent';

const sessions: Session[] = [
  { protocol: 'ap', instance: 'https://one.test', token: 'one', accountId: '1', acct: 'me' },
  { protocol: 'bsky', did: 'did:plc:me', handle: 'me.test', pds: 'https://pds.test', auth: 'oauth', accountId: 'did:plc:me', acct: 'me.test' },
];

const agent = { id: 'bsky-agent' } as unknown as Agent;

jest.mock('@/auth/session', () => ({
  accountKey: (s: Session) => (s.protocol === 'ap' ? `ap:${s.instance}:${s.accountId}` : `bsky:${s.did}`),
  findSession: (key: string) =>
    sessions.find((s) => (s.protocol === 'ap' ? `ap:${s.instance}:${s.accountId}` : `bsky:${s.did}`) === key) ?? null,
}));

jest.mock('masto', () => ({
  createRestAPIClient: ({ url, accessToken }: { url: string; accessToken: string }) => ({ url, accessToken }),
}));

jest.mock('@/auth/bsky-loader', () => ({ getBskyAgent: () => agent }));

const AP_KEY = 'ap:https://one.test:1';
const BSKY_KEY = 'bsky:did:plc:me';

describe('mastoFor', () => {
  it('builds a fresh client after the account is forgotten', () => {
    const session = sessions[0] as Extract<Session, { protocol: 'ap' }>;
    const first = mastoFor(session);
    expect(mastoFor(session)).toBe(first);
    forgetMasto(AP_KEY);
    expect(mastoFor(session)).not.toBe(first);
  });
});

describe('client lookup by account', () => {
  it('returns the client of the named account', () => {
    expect(getMasto(AP_KEY)).toEqual({ url: 'https://one.test', accessToken: 'one' });
    expect(getAgent(BSKY_KEY)).toBe(agent);
  });

  it('fails for an account of the other network or one no longer signed in', () => {
    expect(() => getMasto(BSKY_KEY)).toThrow();
    expect(() => getAgent(AP_KEY)).toThrow();
    expect(() => getMasto('ap:gone:9')).toThrow();
  });
});

describe('foreign-account routing', () => {
  it('treats only posts stamped with another account as foreign', () => {
    const post = bskyPost();
    expect(isForeign(post, BSKY_KEY)).toBe(false);
    expect(isForeign({ ...post, accountKey: BSKY_KEY }, BSKY_KEY)).toBe(false);
    expect(isForeign({ ...post, accountKey: AP_KEY }, BSKY_KEY)).toBe(true);
  });

  it('acts through the acting account unless the post belongs to another', () => {
    const post: Post = bskyPost();
    expect(accountOfPost(post, AP_KEY)).toBe(AP_KEY);
    expect(accountOfPost({ ...post, accountKey: BSKY_KEY }, BSKY_KEY)).toBe(BSKY_KEY);
    expect(accountOfPost({ ...post, accountKey: BSKY_KEY }, AP_KEY)).toBe(BSKY_KEY);
  });
});
