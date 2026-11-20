import type { InfiniteData } from '@tanstack/react-query';

import { pageOf, type Page } from '@/model/page';
import type { Post } from '@/model/post';

import type { MixedPage } from './mixed';
import { isNewer } from './snowflake';

const olderOrEqual = (a: string, b: string) => !isNewer(a, b);

export const reachesTop = (fresh: Post[], top: string) => fresh.some((p) => olderOrEqual(p.cursor, top));

// A newest page proves continuity only when it reaches back to the cached top; otherwise the
// post above the hole carries the id the missing posts start after.
export function mergeNewest(data: InfiniteData<Page<Post>>, fresh: Post[]): InfiniteData<Page<Post>> {
  const [first = { items: [] }, ...rest] = data.pages;
  const top = first.items[0]?.cursor;
  if (!top) return { pages: [pageOf(fresh, fresh.at(-1)?.cursor), ...rest], pageParams: data.pageParams };
  const newer = fresh.filter((p) => isNewer(p.cursor, top));
  if (newer.length === 0) return data;
  const contiguous = reachesTop(fresh, top);
  const last = newer.at(-1)!;
  const head = contiguous ? newer : [...newer.slice(0, -1), { ...last, gap: { sinceId: top } }];
  return { ...data, pages: [{ ...first, items: [...head, ...first.items] }, ...rest] };
}

const time = (post: Post) => Date.parse(post.sortAt) || 0;

// `fetched` is the page of posts directly newer than the gap's `sinceId`, newest first.
export function fillGap<P extends Page<Post, unknown>>(data: InfiniteData<P>, key: string, fetched: Post[]): InfiniteData<P> {
  const pageIndex = data.pages.findIndex((page) => page.items.some((p) => p.key === key));
  if (pageIndex === -1) return data;
  const page = data.pages[pageIndex].items;
  const at = page.findIndex((p) => p.key === key);
  const above = page[at];
  if (!above.gap) return data;

  const known = new Set(data.pages.flatMap((p) => p.items).map((p) => p.key));
  const inside = fetched.filter(
    (p) => isNewer(above.cursor, p.cursor) && isNewer(p.cursor, above.gap!.sinceId) && !known.has(p.key),
  );
  const reached = fetched.some((p) => olderOrEqual(above.cursor, p.cursor));
  const marker = reached || inside.length === 0 ? undefined : { sinceId: inside[0].cursor };
  const { gap: _closed, ...rest } = above;
  // Time order, so the filled posts interleave with another source's on a mixed page.
  const below = [...inside, ...page.slice(at + 1)].sort((a, b) => time(b) - time(a));
  const items = [...page.slice(0, at), marker ? { ...rest, gap: marker } : rest, ...below] as Post[];
  return { ...data, pages: data.pages.map((p, i) => (i === pageIndex ? { ...p, items } : p)) };
}


// Fediverse posts that the newest page cannot connect to the cached ones get a gap marker. Bluesky has
// no "newer than" query, so when its page does not reach the cached top the caller must replace the list.
export function mergeMixedNewest(data: InfiniteData<MixedPage>, ap: Post[] | null, bsky: Post[] | null): InfiniteData<MixedPage> | null {
  const [first, ...rest] = data.pages;
  if (!first) return null;
  const loaded = [...data.pages.flatMap((p) => p.items), ...data.pages.flatMap((p) => p.next?.carry ?? [])];
  const apTop = loaded.find((p) => p.protocol === 'ap');
  const bskyTop = loaded.find((p) => p.protocol === 'bsky');
  const bskyNew = bskyTop ? (bsky ?? []).filter((p) => time(p) > time(bskyTop)) : (bsky ?? []);
  if (bskyTop && bsky?.length && bskyNew.length === bsky.length) return null;
  const apNew = apTop ? (ap ?? []).filter((p) => isNewer(p.cursor, apTop.cursor)) : (ap ?? []);
  const apMarked =
    apTop && ap && apNew.length > 0 && apNew.length === ap.length
      ? [...apNew.slice(0, -1), { ...apNew.at(-1)!, gap: { sinceId: apTop.cursor } }]
      : apNew;
  const known = new Set(loaded.map((p) => p.key));
  const fresh = [...apMarked, ...bskyNew]
    .filter((p) => !known.has(p.key))
    .sort((a, b) => time(b) - time(a));
  if (fresh.length === 0) return data;
  const items = [...fresh, ...first.items].sort((a, b) => time(b) - time(a));
  return { ...data, pages: [{ ...first, items }, ...rest] };
}

// Puts the waiting posts on top of the first page, skipping any a refetch already brought in.
export function mergePending(data: InfiniteData<Page<Post>>, waiting: Post[]): InfiniteData<Page<Post>> {
  const cached = new Set(data.pages.flatMap((page) => page.items).map((s) => s.key));
  const fresh = waiting.filter((s) => !cached.has(s.key));
  const [first = { items: [] }, ...rest] = data.pages;
  return { ...data, pages: [{ ...first, items: [...fresh, ...first.items] }, ...rest] };
}

// Posts newer than what is already shown, judged per source: a Bluesky top must not hide newer fediverse posts.
export function unseenPosts(shown: Post[], pending: Post[], fetched: Post[]) {
  const tops = new Map<Post['protocol'], Post>();
  for (const p of shown) if (!tops.has(p.protocol)) tops.set(p.protocol, p);
  const known = new Set([...shown, ...pending].map((p) => p.key));
  return fetched.filter((p) => {
    const top = tops.get(p.protocol);
    if (known.has(p.key)) return false;
    return !top || (p.protocol === 'ap' ? isNewer(p.cursor, top.cursor) : time(p) > time(top));
  });
}
