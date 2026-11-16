import type { Agent } from '@atproto/api';

import { bskyCreateStarterPack, bskyFollowMembers, graphemesLeft, nearLimit, STARTER_PACK_MAX } from '@/api/bsky/starter-packs';

jest.mock('@/api/client', () => ({ useBsky: jest.fn() }));
jest.mock('@/auth/session', () => ({ useAccountScope: jest.fn() }));
jest.mock('@/api/clients', () => ({ getAgent: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showError: jest.fn() }));

const ME = 'did:plc:me';
const ALICE = 'did:plc:alice';
const BOB = 'did:plc:bob';

describe('creating a starter pack', () => {
  it('creates a reference list and a starter pack that points at it', async () => {
    const listCreate = jest.fn(async () => ({ uri: `at://${ME}/app.bsky.graph.list/3klist`, cid: 'c' }));
    const packCreate = jest.fn(async () => ({ uri: `at://${ME}/app.bsky.graph.starterpack/3kpack`, cid: 'c' }));
    const agent = {
      assertDid: ME,
      app: { bsky: { graph: { list: { create: listCreate }, starterpack: { create: packCreate } } } },
    } as unknown as Agent;

    const id = await bskyCreateStarterPack(agent, { name: 'Rust folks' });

    expect(id).toBe(`${ME}@3kpack`);
    expect(listCreate).toHaveBeenCalledWith(
      { repo: ME },
      expect.objectContaining({ name: 'Rust folks', purpose: 'app.bsky.graph.defs#referencelist' }),
    );
    expect(packCreate).toHaveBeenCalledWith(
      { repo: ME },
      expect.objectContaining({ name: 'Rust folks', list: `at://${ME}/app.bsky.graph.list/3klist` }),
    );
  });
});

describe('following every member of a starter pack', () => {
  it('follows members not yet followed, skipping self', async () => {
    const member = (did: string, following?: string) => ({ subject: { did, handle: `${did}.test`, viewer: { following } } });
    const getList = jest.fn(async () => ({
      data: { items: [member(ME), member(ALICE, 'at://follow'), member(BOB)] },
    }));
    const follow = jest.fn(async () => ({ uri: 'at://x', cid: 'c' }));
    const agent = { assertDid: ME, app: { bsky: { graph: { getList } } }, follow } as unknown as Agent;
    const progress: [number, number][] = [];

    const count = await bskyFollowMembers(agent, `${ME}@3klist`, (done, total) => progress.push([done, total]));

    expect(count).toBe(1);
    expect(follow).toHaveBeenCalledTimes(1);
    expect(follow).toHaveBeenCalledWith(BOB);
    expect(progress).toEqual([[1, 1]]);
  });
});

describe('starter pack length limits', () => {
  it('matches the lexicon limits', () => {
    expect(STARTER_PACK_MAX).toEqual({ name: 50, description: 300 });
  });

  it('counts graphemes, not code units, and ignores surrounding whitespace', () => {
    expect(graphemesLeft('  abc  ', 50)).toBe(47);
    expect(graphemesLeft('👨‍👩‍👧‍👦'.repeat(3), 50)).toBe(47);
    expect(graphemesLeft('a'.repeat(51), 50)).toBe(-1);
  });

  it('shows the counter once a fifth of the limit remains', () => {
    expect(nearLimit(11, 50)).toBe(false);
    expect(nearLimit(10, 50)).toBe(true);
    expect(nearLimit(-3, 50)).toBe(true);
  });
});
