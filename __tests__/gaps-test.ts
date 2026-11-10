import type { InfiniteData } from '@tanstack/react-query';

import { fillGap, mergeMixedNewest, mergeNewest, reachesTop, unseenMixed } from '@/api/gaps';
import type { MixedPage } from '@/api/mixed';
import type { Post } from '@/model/post';

const post = (id: string, gap?: string) => ({ id, cursor: id, key: `ap:${id}`, ...(gap && { gap: { sinceId: gap } }) }) as Post;
const data = (...pages: Post[][]): InfiniteData<Post[]> => ({ pages, pageParams: pages.map(() => undefined) });
const ids = (d: InfiniteData<Post[]>) => d.pages.flat().map((p) => `${p.cursor}${p.gap ? `>${p.gap.sinceId}` : ''}`);

describe('mergeNewest', () => {
  it('prepends only newer posts when the page reaches the cached top', () => {
    expect(ids(mergeNewest(data([post('5'), post('4')]), [post('7'), post('6'), post('5')]))).toEqual(['7', '6', '5', '4']);
  });

  it('marks a gap above the cached top when the page does not reach it', () => {
    expect(ids(mergeNewest(data([post('5')]), [post('9'), post('8'), post('7')]))).toEqual(['9', '8', '7>5', '5']);
  });

  it('compares ids numerically by length', () => {
    expect(ids(mergeNewest(data([post('99')]), [post('101'), post('100'), post('99')]))).toEqual(['101', '100', '99']);
  });

  it('leaves the data untouched when nothing is newer', () => {
    const d = data([post('5')]);
    expect(mergeNewest(d, [post('5')])).toBe(d);
  });
});

describe('fillGap', () => {
  it('inserts the fetched page under the gap post and closes the gap when it reaches it', () => {
    const d = data([post('9'), post('8', '5'), post('5')]);
    expect(ids(fillGap(d, 'ap:8', [post('8'), post('7'), post('6')]))).toEqual(['9', '8', '7', '6', '5']);
  });

  it('keeps a gap, moved past the fetched page, when still not contiguous', () => {
    const d = data([post('9'), post('8', '5'), post('5')]);
    expect(ids(fillGap(d, 'ap:8', [post('7'), post('6')]))).toEqual(['9', '8>7', '7', '6', '5']);
  });

  it('closes the gap when nothing newer comes back', () => {
    const d = data([post('9', '5'), post('5')]);
    expect(ids(fillGap(d, 'ap:9', []))).toEqual(['9', '5']);
  });

  it('ignores a post that is not in the list', () => {
    const d = data([post('9')]);
    expect(fillGap(d, 'ap:1', [post('2')])).toBe(d);
  });
});

describe('deleted cached top', () => {
  it('still merges contiguously when the page reaches past the deleted id', () => {
    expect(ids(mergeNewest(data([post('5'), post('4')]), [post('7'), post('6'), post('3')]))).toEqual(['7', '6', '5', '4']);
  });

  it('settles after one fill when the id the gap starts after no longer exists', () => {
    const d = mergeNewest(data([post('5')]), [post('9'), post('8')]);
    expect(ids(d)).toEqual(['9', '8>5', '5']);
    expect(ids(fillGap(d, 'ap:8', [post('8'), post('7'), post('6')]))).toEqual(['9', '8', '7', '6', '5']);
  });

  it('reachesTop is true for an equal or older post only', () => {
    expect(reachesTop([post('9')], '5')).toBe(false);
    expect(reachesTop([post('9'), post('5')], '5')).toBe(true);
  });
});

const mixedPost = (id: string, protocol: 'ap' | 'bsky', at: number) =>
  ({ id, cursor: id, key: `${protocol}:${id}`, protocol, sortAt: new Date(at).toISOString() }) as Post;
const mixed = (...items: Post[]): InfiniteData<MixedPage> => ({
  pages: [{ items, next: undefined, failed: [] }],
  pageParams: [undefined],
});
const mixedIds = (d: InfiniteData<MixedPage>) => d.pages[0].items.map((p) => `${p.key}${p.gap ? '*' : ''}`);

describe('mergeMixedNewest', () => {
  const base = mixed(mixedPost('5', 'ap', 5000), mixedPost('b1', 'bsky', 4000));

  it('merges both sources by time when the fediverse page reaches the cached top', () => {
    const merged = mergeMixedNewest(base, [mixedPost('6', 'ap', 6000), mixedPost('5', 'ap', 5000)], [mixedPost('b2', 'bsky', 7000), mixedPost('b1', 'bsky', 4000)]);
    expect(mixedIds(merged!)).toEqual(['bsky:b2', 'ap:6', 'ap:5', 'bsky:b1']);
  });

  it('marks the oldest new fediverse post as a gap when the page does not reach the top', () => {
    const merged = mergeMixedNewest(base, [mixedPost('9', 'ap', 9000), mixedPost('8', 'ap', 8000)], [mixedPost('b1', 'bsky', 4000)]);
    expect(mixedIds(merged!)).toEqual(['ap:9', 'ap:8*', 'ap:5', 'bsky:b1']);
  });

  it('asks for a replacement when the Bluesky page does not reach the cached top', () => {
    expect(mergeMixedNewest(base, [mixedPost('5', 'ap', 5000)], [mixedPost('b3', 'bsky', 9000), mixedPost('b2', 'bsky', 8000)])).toBeNull();
  });

  it('keeps the data when the fediverse request failed and Bluesky has nothing new', () => {
    expect(mergeMixedNewest(base, null, [mixedPost('b1', 'bsky', 4000)])).toBe(base);
  });

  it('fills a gap on a mixed page', () => {
    const gapped = mixed(mixedPost('9', 'ap', 9000), { ...mixedPost('8', 'ap', 8000), gap: { sinceId: '5' } }, mixedPost('5', 'ap', 5000));
    const filled = fillGap(gapped, 'ap:8', [mixedPost('8', 'ap', 8000), mixedPost('7', 'ap', 7000)]);
    expect(mixedIds(filled)).toEqual(['ap:9', 'ap:8', 'ap:7', 'ap:5']);
  });
});

describe('unseenMixed', () => {
  const shown = [mixedPost('b5', 'bsky', 9000), mixedPost('5', 'ap', 5000)];

  it('offers fediverse posts newer than the fediverse top even when older than the Bluesky top', () => {
    const unseen = unseenMixed(shown, [], [mixedPost('6', 'ap', 6000), mixedPost('5', 'ap', 5000), mixedPost('b5', 'bsky', 9000)]);
    expect(unseen.map((p) => p.key)).toEqual(['ap:6']);
  });

  it('skips posts already waiting and Bluesky posts not newer than the Bluesky top', () => {
    const waiting = [mixedPost('6', 'ap', 6000)];
    expect(unseenMixed(shown, waiting, [mixedPost('6', 'ap', 6000), mixedPost('b4', 'bsky', 8000)])).toEqual([]);
  });
});

describe('fillGap on mixed data', () => {
  const mixed = (id: string, at: string, gap?: string) =>
    ({ ...post(id, gap), sortAt: at, protocol: 'ap' }) as Post;
  const bsky = (id: string, at: string) => ({ id, cursor: id, key: `bsky:${id}`, sortAt: at, protocol: 'bsky' }) as Post;

  it('interleaves filled posts with the other source by time', () => {
    const page: MixedPage = {
      items: [mixed('9', '2026-01-01T10:00:00Z'), mixed('8', '2026-01-01T09:00:00Z', '5'), bsky('b1', '2026-01-01T07:30:00Z'), mixed('5', '2026-01-01T05:00:00Z')],
      next: undefined,
      failed: [],
    };
    const filled = fillGap({ pages: [page], pageParams: [undefined] }, 'ap:8', [
      mixed('7', '2026-01-01T08:00:00Z'),
      mixed('6', '2026-01-01T07:00:00Z'),
    ]);
    expect(filled.pages[0].items.map((p) => p.key)).toEqual(['ap:9', 'ap:8', 'ap:7', 'bsky:b1', 'ap:6', 'ap:5']);
  });
});

describe('mergeMixedNewest dedupe', () => {
  const ap = (id: string, at: string) => ({ id, cursor: id, key: `ap:${id}`, sortAt: at, protocol: 'ap' }) as Post;
  const bsky = (id: string, at: string) => ({ id, cursor: id, key: `bsky:${id}`, sortAt: at, protocol: 'bsky' }) as Post;

  it('does not reinsert posts that sit in a later page or the carry', () => {
    const d: InfiniteData<MixedPage> = {
      pages: [
        { items: [ap('9', '2026-01-01T09:00:00Z')], next: undefined, failed: [] },
        { items: [bsky('b2', '2026-01-01T06:00:00Z')], next: { carry: [bsky('b1', '2026-01-01T05:00:00Z')] }, failed: [] },
      ],
      pageParams: [undefined, { carry: [] }],
    };
    const merged = mergeMixedNewest(d, null, [bsky('b2', '2026-01-01T06:00:00Z'), bsky('b1', '2026-01-01T05:00:00Z')])!;
    expect(merged.pages.flatMap((p) => p.items).map((p) => p.key)).toEqual(['ap:9', 'bsky:b2']);
  });
});
