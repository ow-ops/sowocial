import { QueryClient, type InfiniteData, type Query } from '@tanstack/react-query';

import { patchStatus, removeStatus } from '@/api/cache';
import { keys } from '@/api/keys';
import {
  CARRY_CAP,
  loadMixedPage,
  planPage,
  sourcesToFetch,
  toMixedData,
  type Fetchers,
  type MixedPage,
} from '@/api/mixed';
import { dehydrateOptions, shouldPersist } from '@/api/persist';
import type { Post } from '@/model/post';

import { drain, lcg, makePost, stream } from './fixtures/mixed';

const times = (rand: () => number, count: number, span: number, origin = 1_700_000_000_000) =>
  Array.from({ length: count }, () => origin - Math.floor(rand() * span));

const fetchersFor = (ap: ReturnType<typeof stream>, bsky: ReturnType<typeof stream>): Fetchers => ({
  ap: async (cursor) => ap.fetchPage(cursor),
  bsky: async (cursor) => bsky.fetchPage(cursor),
});

const time = (p: { sortAt: string }) => Date.parse(p.sortAt);

describe('mixed timeline merge', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('merges two random streams without gaps or duplicates (seed %i)', async (seed) => {
    const rand = lcg(seed);
    const ap = stream('ap', times(rand, Math.floor(rand() * 90), rand() < 0.5 ? 1_000 : 10_000_000));
    const bsky = stream('bsky', times(rand, Math.floor(rand() * 90), rand() < 0.5 ? 1_000 : 10_000_000));
    const { pages } = await drain(fetchersFor(ap, bsky));
    const items = pages.flatMap((p) => p.items);

    expect(new Set(items.map((p) => p.key)).size).toBe(items.length);
    expect(new Set(items.map((p) => p.key))).toEqual(new Set([...ap.posts, ...bsky.posts].map((p) => p.key)));
    for (let i = 1; i < items.length; i++) expect(time(items[i - 1])).toBeGreaterThanOrEqual(time(items[i]));
    for (const page of pages) expect(page.next?.carry.length ?? 0).toBeLessThanOrEqual(CARRY_CAP);
    for (const page of pages.slice(0, -1)) expect(page.items.length).toBeGreaterThan(0);
  });

  it('keeps a lagging source from being skipped', async () => {
    const ap = stream('ap', Array.from({ length: 40 }, (_, i) => 1_000_000 - i));
    const bsky = stream('bsky', Array.from({ length: 5 }, (_, i) => 500_000 - i * 1000));
    const { pages } = await drain(fetchersFor(ap, bsky));
    const first = pages[0];
    expect(first.items.every((p) => time(p) >= 1_000_000 - 19)).toBe(true);
    expect(first.items.some((p) => p.protocol === 'bsky')).toBe(false);
    expect(pages.flatMap((p) => p.items)).toHaveLength(45);
  });

  it('stops asking a source once it is exhausted', async () => {
    const ap = stream('ap', [3000, 2000]);
    const bsky = stream('bsky', Array.from({ length: 30 }, (_, i) => 1000 - i));
    const calls = { ap: 0, bsky: 0 };
    const { pages } = await drain({
      ap: async (c) => (calls.ap++, ap.fetchPage(c)),
      bsky: async (c) => (calls.bsky++, bsky.fetchPage(c)),
    });
    expect(calls.ap).toBe(2);
    expect(pages.flatMap((p) => p.items)).toHaveLength(32);
  });

  it('finishes when both sources are empty', async () => {
    const { pages } = await drain({ ap: async () => [], bsky: async () => [] });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual({ items: [], next: undefined, failed: [] });
  });

  it('emits the healthy source when the other fails, and keeps the failed cursor', async () => {
    const bsky = stream('bsky', [3000, 2000, 1000]);
    const page = await loadMixedPage(undefined, {
      ap: async () => {
        throw new Error('ap down');
      },
      bsky: async (c) => bsky.fetchPage(c),
    });
    expect(page.failed).toEqual(['ap']);
    expect(page.items.map((p) => p.id)).toEqual(['0', '1', '2']);
    expect(page.next).toEqual({ ap: undefined, bsky: 'bsky:2', carry: [] });
  });

  it('recovers the failed source on the next page', async () => {
    const ap = stream('ap', [2500, 1500]);
    const bsky = stream('bsky', [3000, 2000, 1000]);
    let fail = true;
    const fetchers: Fetchers = {
      ap: async (c) => {
        if (fail) throw new Error('down');
        return ap.fetchPage(c);
      },
      bsky: async (c) => bsky.fetchPage(c),
    };
    const first = await loadMixedPage(undefined, fetchers);
    fail = false;
    const second = await loadMixedPage(first.next, fetchers);
    expect(second.failed).toEqual([]);
    expect(second.items.filter((p) => p.protocol === 'ap')).toHaveLength(2);
  });

  it('throws when every attempted source fails and nothing is carried', async () => {
    const down = async () => {
      throw new Error('offline');
    };
    await expect(loadMixedPage(undefined, { ap: down, bsky: down })).rejects.toThrow('offline');
  });

  it('does not throw when the failing source is the only one attempted but carry exists', () => {
    const carried = [makePost('bsky', 'old', 1000)];
    const page = planPage({ ap: undefined, bsky: 'c', carry: carried }, { ap: { error: new Error('x') } });
    expect(page.items.map((p) => p.id)).toEqual(['old']);
    expect(page.failed).toEqual(['ap']);
  });

  it('removes duplicate posts across carry and new pages', () => {
    const dup = makePost('ap', '1', 5000);
    const page = planPage(
      { ap: 'c', bsky: null, carry: [dup] },
      { ap: { posts: [dup, makePost('ap', '2', 4000)], next: 'z' } },
    );
    expect(page.items.map((p) => p.key)).toEqual(['ap:1', 'ap:2']);
  });

  it('treats a boost of the same post by two people as distinct posts', () => {
    const a = { ...makePost('bsky', '1', 5000), key: 'bsky:1:a' };
    const b = { ...makePost('bsky', '1', 4000), key: 'bsky:1:b' };
    const page = planPage(undefined, { bsky: { posts: [a, b], next: null }, ap: { posts: [], next: null } });
    expect(page.items).toHaveLength(2);
  });

  it('only fetches sources that are not exhausted and have nothing carried', () => {
    expect(sourcesToFetch(undefined)).toEqual(['ap', 'bsky']);
    expect(sourcesToFetch({ ap: null, carry: [] })).toEqual(['bsky']);
    expect(sourcesToFetch({ ap: 'a', bsky: 'b', carry: [makePost('ap', '1', 1)] })).toEqual(['bsky']);
  });

  it('flattens pages for the list and reports the latest failures', () => {
    const data = toMixedData({
      pages: [
        { items: [makePost('ap', '1', 1)], next: undefined, failed: ['ap' as const] },
        { items: [makePost('ap', '2', 0)], next: undefined, failed: [] },
      ],
      pageParams: [undefined, undefined],
    });
    expect(data.pages.map((p) => p.length)).toEqual([1, 1]);
    expect(data.failed).toEqual([]);
  });
});

describe('mixed timeline cache and persistence', () => {
  const mixedKey = keys.mixedTimeline('account.ap', 'account.bsky');
  const page = (items: Post[], carry: Post[] = []): MixedPage => ({
    items,
    next: { ap: 'a', bsky: 'b', carry },
    failed: [],
  });

  it('reaches posts in the page and in the carry when a post changes or is deleted', () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const shown = { ...makePost('ap', '1', 3000), accountKey: 'account.ap' };
    const carried = { ...makePost('ap', '2', 1000), accountKey: 'account.ap' };
    client.setQueryData<InfiniteData<MixedPage>>(mixedKey, { pages: [page([shown], [carried])], pageParams: [undefined] });

    patchStatus(client, '2', (p) => ({ ...p, counts: { replies: 0, reposts: 0, likes: 9 } }));
    const patched = client.getQueryData<InfiniteData<MixedPage>>(mixedKey)!.pages[0];
    expect(patched.next?.carry[0].counts.likes).toBe(9);
    expect(patched.next?.carry[0].accountKey).toBe('account.ap');

    removeStatus(client, '1');
    expect(client.getQueryData<InfiniteData<MixedPage>>(mixedKey)!.pages[0].items).toEqual([]);
  });

  it('keeps the owning account when an updated post replaces the cached one', () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    client.setQueryData<InfiniteData<Post[]>>(keys.accountHome('account.bsky'), {
      pages: [[{ ...makePost('bsky', '1', 1), accountKey: 'account.bsky' }]],
      pageParams: [undefined],
    });
    patchStatus(client, '1', () => makePost('bsky', '1', 1));
    expect(client.getQueryData<InfiniteData<Post[]>>(keys.accountHome('account.bsky'))!.pages[0][0].accountKey).toBe(
      'account.bsky',
    );
  });

  it('persists only the first page of the mixed timeline, with its carry and no raw payloads', () => {
    const query = (pageParams: unknown[]) =>
      ({ state: { status: 'success', data: { pages: [], pageParams } }, queryKey: mixedKey }) as unknown as Query;
    expect(shouldPersist(query([undefined]))).toBe(true);
    expect(shouldPersist(query([{ carry: [] }]))).toBe(false);

    const raw = { ...makePost('ap', '1', 1), raw: { ap: {} } } as Post;
    const data: InfiniteData<MixedPage> = {
      pages: [page([raw], [raw]), page([raw])],
      pageParams: [undefined, { carry: [] }],
    };
    const saved = dehydrateOptions.serializeData(data) as InfiniteData<MixedPage>;
    expect(saved.pageParams).toEqual([undefined]);
    expect(saved.pages).toHaveLength(1);
    expect(saved.pages[0].items[0]).not.toHaveProperty('raw');
    expect(saved.pages[0].next?.carry[0]).not.toHaveProperty('raw');
  });
});
