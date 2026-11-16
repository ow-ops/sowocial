import type { InfiniteData, Query, QueryClient, QueryKey } from '@tanstack/react-query';

import type { Notification, Post } from '@/model/post';

import { accountOf, keys, rootOf } from './keys';
import type { MixedPage } from './mixed';

// Every query that holds statuses must live under one of these roots, or actions
// like favourite won't update it.
const LIST_ROOTS = new Set<unknown>(['timeline', 'account-statuses']);
const STATUS_ROOTS = new Set<unknown>([...LIST_ROOTS, 'thread', 'status', 'notifications']);

// A like by one account must not show on another account's copy, so updates check each post's owner.
const statusQueries = (queryClient: QueryClient, roots: ReadonlySet<unknown>) =>
  queryClient.getQueryCache().findAll({ predicate: (query: Query) => roots.has(rootOf(query.queryKey)) });

export type StatusAction = 'favourite' | 'reblog' | 'bookmark';

export const actionFields = {
  favourite: { flag: 'liked', count: 'likes', uri: 'likeUri' },
  reblog: { flag: 'reposted', count: 'reposts', uri: 'repostUri' },
  bookmark: { flag: 'bookmarked', count: null, uri: null },
} as const;

export function applyAction(post: Post, action: StatusAction, active: boolean): Post {
  const { flag, count, uri } = actionFields[action];
  const next = { ...post, viewer: { ...post.viewer, [flag]: active } };
  if (uri && !active) next.viewer[uri] = undefined;
  if (count) next.counts = { ...post.counts, [count]: Math.max(0, post.counts[count] + (active ? 1 : -1)) };
  return next;
}

type ThreadData = { ancestors: Post[]; descendants: Post[] };

// A dropped post that carries a gap marker hands it to the post above it, so the hole stays fillable.
export function mapKeepingGaps(pages: Post[][], fn: (s: Post) => Post | null): Post[][] {
  const result = pages.map(() => [] as Post[]);
  let above: number | undefined;
  pages.forEach((items, i) =>
    items.forEach((p) => {
      const next = fn(p);
      if (next) {
        result[i].push(next);
        above = i;
      } else if (p.gap && above !== undefined) {
        const row = result[above];
        row[row.length - 1] = { ...row[row.length - 1], gap: p.gap };
      }
    }),
  );
  return result;
}

function mapCachedStatuses(queryClient: QueryClient, account: string, update: (s: Post) => Post | null) {
  for (const query of statusQueries(queryClient, STATUS_ROOTS)) {
    const owner = accountOf(query.queryKey);
    // Mixed timelines hold two accounts' posts, each stamped with its own.
    const fn = (s: Post) => ((s.accountKey ?? owner) === account ? update(s) : s);
    const root = rootOf(query.queryKey);
    queryClient.setQueryData(query.queryKey, (data: unknown) =>
      root === 'thread'
        ? mapThread(data as ThreadData | undefined, fn)
        : root === 'status'
          ? data && (fn(data as Post) ?? data)
          : root === 'notifications'
            ? mapNotifications(data as InfiniteData<Notification[]> | undefined, fn)
            : mapPages(data as InfiniteData<Post[] | MixedPage> | undefined, fn),
    );
  }
}

const mapList = (list: Post[], fn: (s: Post) => Post | null) => list.flatMap((s) => fn(s) ?? []);

const mapThread = (data: ThreadData | undefined, fn: (s: Post) => Post | null) =>
  data && { ancestors: mapList(data.ancestors, fn), descendants: mapList(data.descendants, fn) };

const mapNotifications = (data: InfiniteData<Notification[]> | undefined, fn: (s: Post) => Post | null) =>
  data && {
    ...data,
    pages: data.pages.map((p) =>
      p.flatMap((n) => {
        if (!n.post) return n;
        const post = fn(n.post);
        return post ? { ...n, post } : [];
      }),
    ),
  };

function mapPages(data: InfiniteData<Post[] | MixedPage> | undefined, fn: (s: Post) => Post | null) {
  if (!data) return data;
  const mapped = mapKeepingGaps(data.pages.map((page) => (Array.isArray(page) ? page : page.items)), fn);
  return {
    ...data,
    pages: data.pages.map((page, i) =>
      Array.isArray(page)
        ? mapped[i]
        : { ...page, items: mapped[i], next: page.next && { ...page.next, carry: mapList(page.next.carry, fn) } },
    ),
  };
}

const matches = (p: Post, id: string) => p.id === id || p.wrapperId === id;

export function patchStatus(queryClient: QueryClient, account: string, id: string, update: (p: Post) => Post) {
  mapCachedStatuses(queryClient, account, (p) => {
    if (!matches(p, id)) return p;
    const updated = update(p);
    const next = { ...updated, ...(p.accountKey && { accountKey: p.accountKey }), ...(p.gap && { gap: p.gap }) };
    if (!p.repostedBy) return next;
    return { ...next, key: p.key, cursor: p.cursor, sortAt: p.sortAt, repostedBy: p.repostedBy, wrapperId: p.wrapperId };
  });
}

export type Snapshot = [QueryKey, unknown][];

export async function snapshotStatusCaches(queryClient: QueryClient): Promise<Snapshot> {
  const queries = statusQueries(queryClient, STATUS_ROOTS);
  await Promise.all(queries.map((query) => queryClient.cancelQueries({ queryKey: query.queryKey, exact: true })));
  return queries.map((query) => [query.queryKey, query.state.data]);
}

export function restoreSnapshot(queryClient: QueryClient, snapshot: Snapshot) {
  for (const [queryKey, data] of snapshot) queryClient.setQueryData(queryKey, data);
}

// Drops a deleted status, and boosts of it, from every cached list.
export function removeStatus(queryClient: QueryClient, account: string, id: string) {
  mapCachedStatuses(queryClient, account, (p) => (matches(p, id) ? null : p));
  queryClient.removeQueries({ queryKey: keys.status(account, id) });
}
