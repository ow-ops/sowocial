import type { InfiniteData } from '@tanstack/react-query';

import type { Page } from '@/model/page';
import type { Post, Protocol } from '@/model/post';
import { bskyLink } from '@/utils/links';
import { arrangeTimeline } from '@/utils/timeline';

import { PAGE_SIZE } from './pagination';

export type Source = Protocol;

const SOURCES: readonly Source[] = ['ap', 'bsky'];

export const CARRY_CAP = SOURCES.length * PAGE_SIZE;

// `floor` is set while a source that failed on the first page is retried: its posts newer than it would land below older ones.
export type MixedParam = { ap?: string | null; bsky?: string | null; carry: Post[]; floor?: number };

type SourcePage = { posts: Post[]; next: string | null };

export type SourceResult = SourcePage | { error: unknown };

export type MixedPage = Page<Post, MixedParam> & { failed: Source[] };

export type Fetchers = Record<Source, (cursor: string | undefined) => Promise<Page<Post>>>;

const time = (post: Post) => {
  const value = Date.parse(post.sortAt);
  return Number.isNaN(value) ? 0 : value;
};

const newestFirst = (a: Post, b: Post) => time(b) - time(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

const dedupe = (posts: Post[]) => {
  const seen = new Set<string>();
  return posts.filter((p) => !seen.has(p.key) && !!seen.add(p.key));
};

const bskyPost = (url: string | undefined) => {
  const link = url ? bskyLink(url) : null;
  return link?.kind === 'post' ? link : null;
};

// Bridgy Fed copies: a fediverse copy of a Bluesky post links to its bsky.app URL, by handle or by DID, and a
// Bluesky copy of a fediverse post carries the fediverse URL as bridgyOriginalUrl.
export const dropBridgedCopies = (posts: Post[]) => {
  const bskyByRkey = new Map<string, { handle: string; did: string }[]>();
  const apUrls = new Set<string>();
  for (const post of posts) {
    if (post.protocol === 'ap') {
      if (post.url) apUrls.add(post.url);
      continue;
    }
    const link = bskyPost(post.url);
    if (link) bskyByRkey.set(link.rkey, [...(bskyByRkey.get(link.rkey) ?? []), { handle: link.handle, did: post.author.id }]);
  }
  return posts.filter((copy) => {
    if (copy.protocol === 'bsky') return !(copy.bridgyOriginalUrl && apUrls.has(copy.bridgyOriginalUrl));
    const link = bskyPost(copy.url);
    return !link || !bskyByRkey.get(link.rkey)?.some((n) => link.handle === n.handle || link.handle === n.did);
  });
};

export const sourcesToFetch = (param: MixedParam | undefined) =>
  SOURCES.filter((s) => param?.[s] !== null && !param?.carry.some((p) => p.protocol === s));

export function planPage(param: MixedParam | undefined, results: Partial<Record<Source, SourceResult>>): MixedPage {
  const carry = param?.carry ?? [];
  const cursors: Record<Source, string | null | undefined> = { ap: param?.ap, bsky: param?.bsky };
  const retryFloor = param?.floor;
  const pool = [...carry];
  const failed: Source[] = [];
  let attempted = 0;
  let succeeded = 0;

  for (const source of SOURCES) {
    const result = results[source];
    if (!result) continue;
    attempted++;
    if ('error' in result) {
      failed.push(source);
      continue;
    }
    succeeded++;
    const retried = retryFloor !== undefined && param?.[source] === undefined;
    pool.push(...(retried ? result.posts.filter((p) => time(p) <= retryFloor) : result.posts));
    cursors[source] = result.posts.length > 0 ? result.next : null;
  }

  if (attempted > 0 && succeeded === 0 && carry.length === 0) {
    const first = failed.map((s) => (results[s] as { error: unknown }).error)[0];
    throw first instanceof Error ? first : new Error(String(first));
  }

  const posts = dedupe(pool).sort(newestFirst);
  const bounds = SOURCES.flatMap((source) => {
    if (cursors[source] === null || failed.includes(source)) return [];
    const times = posts.filter((p) => p.protocol === source).map(time);
    return times.length > 0 ? [Math.min(...times)] : [];
  });
  const boundary = bounds.length > 0 ? Math.max(...bounds) : -Infinity;
  const shown = dropBridgedCopies(posts);
  const items = shown.filter((p) => time(p) >= boundary);
  const rest = shown.filter((p) => time(p) < boundary);
  const exhausted = SOURCES.every((s) => cursors[s] === null);

  const retrying = failed.some((s) => cursors[s] === undefined);
  const floor = items.length > 0 ? time(items[items.length - 1]) : retryFloor;

  return {
    items,
    next:
      exhausted && rest.length === 0
        ? undefined
        : { ap: cursors.ap, bsky: cursors.bsky, carry: rest, ...(retrying && { floor }) },
    failed,
  };
}

export async function loadMixedPage(param: MixedParam | undefined, fetchers: Fetchers): Promise<MixedPage> {
  const wanted = sourcesToFetch(param);
  const settled = await Promise.allSettled(wanted.map((s) => fetchers[s](param?.[s] ?? undefined)));
  const results: Partial<Record<Source, SourceResult>> = {};
  wanted.forEach((source, i) => {
    const outcome = settled[i];
    results[source] =
      outcome.status === 'fulfilled'
        ? { posts: outcome.value.items, next: outcome.value.next ?? null }
        : { error: outcome.reason };
  });
  return planPage(param, results);
}

export const selectMixed = (data: InfiniteData<MixedPage, MixedParam | undefined>) => ({
  ...arrangeTimeline(data),
  failed: data.pages.at(-1)?.failed ?? [],
});
