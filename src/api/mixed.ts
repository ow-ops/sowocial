import type { InfiniteData } from '@tanstack/react-query';

import type { Post, Protocol } from '@/model/post';

import { PAGE_SIZE } from './pagination';

export type Source = Protocol;

export const SOURCES: readonly Source[] = ['ap', 'bsky'];

export const CARRY_CAP = SOURCES.length * PAGE_SIZE;

export type MixedParam = { ap?: string | null; bsky?: string | null; carry: Post[] };

export type SourcePage = { posts: Post[]; next: string | null };

export type SourceResult = SourcePage | { error: unknown };

export type MixedPage = { items: Post[]; next: MixedParam | undefined; failed: Source[] };

export type Fetchers = Record<Source, (cursor: string | undefined) => Promise<Post[]>>;

const time = (post: Post) => {
  const value = Date.parse(post.sortAt);
  return Number.isNaN(value) ? 0 : value;
};

const newestFirst = (a: Post, b: Post) => time(b) - time(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

const dedupe = (posts: Post[]) => {
  const seen = new Set<string>();
  return posts.filter((p) => !seen.has(p.key) && !!seen.add(p.key));
};

export const sourcesToFetch = (param: MixedParam | undefined) =>
  SOURCES.filter((s) => param?.[s] !== null && !param?.carry.some((p) => p.protocol === s));

export function planPage(param: MixedParam | undefined, results: Partial<Record<Source, SourceResult>>): MixedPage {
  const carry = param?.carry ?? [];
  const cursors: Record<Source, string | null | undefined> = { ap: param?.ap, bsky: param?.bsky };
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
    pool.push(...result.posts);
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
  const items = posts.filter((p) => time(p) >= boundary);
  const rest = posts.filter((p) => time(p) < boundary);
  const exhausted = SOURCES.every((s) => cursors[s] === null);

  return {
    items,
    next: exhausted && rest.length === 0 ? undefined : { ap: cursors.ap, bsky: cursors.bsky, carry: rest },
    failed,
  };
}

const nextCursor = (posts: Post[]) => posts.at(-1)?.cursor || null;

export async function loadMixedPage(param: MixedParam | undefined, fetchers: Fetchers): Promise<MixedPage> {
  const wanted = sourcesToFetch(param);
  const settled = await Promise.allSettled(wanted.map((s) => fetchers[s](param?.[s] ?? undefined)));
  const results: Partial<Record<Source, SourceResult>> = {};
  wanted.forEach((source, i) => {
    const outcome = settled[i];
    results[source] =
      outcome.status === 'fulfilled'
        ? { posts: outcome.value, next: nextCursor(outcome.value) }
        : { error: outcome.reason };
  });
  return planPage(param, results);
}

export const toMixedData = (data: InfiniteData<MixedPage, MixedParam | undefined>) => ({
  ...data,
  pages: data.pages.map((p) => p.items),
  failed: data.pages.at(-1)?.failed ?? [],
});
