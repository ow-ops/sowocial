import type { Agent } from '@atproto/api';

import { clientForPost, getClientFor, isForeign } from '@/api/clients';
import type { Client } from '@/api/client';
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

const active: Client = { protocol: 'bsky', agent: { id: 'active' } as unknown as Agent };

describe('foreign-account routing', () => {
  it('treats only posts stamped with another account as foreign', () => {
    const post = bskyPost();
    expect(isForeign(post, BSKY_KEY)).toBe(false);
    expect(isForeign({ ...post, accountKey: BSKY_KEY }, BSKY_KEY)).toBe(false);
    expect(isForeign({ ...post, accountKey: AP_KEY }, BSKY_KEY)).toBe(true);
  });

  it('keeps the active client for the active account', () => {
    expect(clientForPost({ ...bskyPost(), accountKey: BSKY_KEY }, active, BSKY_KEY)).toBe(active);
  });

  it('uses the owning fediverse account for a foreign post', () => {
    const post: Post = { ...bskyPost(), accountKey: AP_KEY };
    const client = clientForPost(post, active, BSKY_KEY);
    expect(client).toEqual({ protocol: 'ap', masto: { url: 'https://one.test', accessToken: 'one' } });
  });

  it('uses the owning Bluesky account for a foreign post', () => {
    const post: Post = { ...bskyPost(), accountKey: BSKY_KEY };
    const fediverseActive: Client = getClientFor(AP_KEY)!;
    expect(clientForPost(post, fediverseActive, AP_KEY)).toEqual({ protocol: 'bsky', agent });
  });

  it('fails when the owning account is no longer signed in', () => {
    expect(() => clientForPost({ ...bskyPost(), accountKey: 'ap:gone:9' }, active, BSKY_KEY)).toThrow();
  });
});
