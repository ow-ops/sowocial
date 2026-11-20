import type { InfiniteData, Query, QueryClient } from '@tanstack/react-query';

import type { Page } from '@/model/page';
import type { Notification, Post } from '@/model/post';

import type { StatusAction } from './backend/types';
import { accountOf, keys, rootOf } from './keys';
import type { MixedParam } from './mixed';

// Every query that holds statuses must live under one of these roots, or actions
// like favourite won't update it.
const LIST_ROOTS = new Set<unknown>(['timeline', 'account-statuses']);
const STATUS_ROOTS = new Set<unknown>([...LIST_ROOTS, 'thread', 'status', 'notifications']);

// A like by one account must not show on another account's copy, so updates check each post's owner.
const statusQueries = (queryClient: QueryClient, roots: ReadonlySet<unknown>) =>
  queryClient.getQueryCache().findAll({ predicate: (query: Query) => roots.has(rootOf(query.queryKey)) });

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
        return;
      }
      if (p.gap && above !== undefined) {
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
            ? mapNotifications(data as InfiniteData<Page<Notification>> | undefined, fn)
            : mapPages(data as InfiniteData<StatusPage> | undefined, fn),
    );
  }
}

const mapList = (list: Post[], fn: (s: Post) => Post | null) => list.flatMap((s) => fn(s) ?? []);

const mapThread = (data: ThreadData | undefined, fn: (s: Post) => Post | null) =>
  data && { ancestors: mapList(data.ancestors, fn), descendants: mapList(data.descendants, fn) };

const mapNotifications = (data: InfiniteData<Page<Notification>> | undefined, fn: (s: Post) => Post | null) =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.flatMap((n) => {
        if (!n.post) return n;
        const post = fn(n.post);
        return post ? { ...n, post } : [];
      }),
    })),
  };

// Lists drained through usePagedList hold plain arrays; the rest hold pages.
type StatusPage = Post[] | Page<Post, string | MixedParam>;

const itemsOf = (page: StatusPage) => (Array.isArray(page) ? page : page.items);

const mapCarry = (next: string | MixedParam | undefined, fn: (s: Post) => Post | null) =>
  typeof next === 'object' ? { ...next, carry: mapList(next.carry, fn) } : next;

function mapPages(data: InfiniteData<StatusPage> | undefined, fn: (s: Post) => Post | null) {
  if (!data) return data;
  const mapped = mapKeepingGaps(data.pages.map(itemsOf), fn);
  const pages = data.pages.map((page, i) =>
    Array.isArray(page) ? mapped[i] : { ...page, items: mapped[i], next: mapCarry(page.next, fn) },
  );
  return { ...data, pages };
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

// Mastodon streams an edit only to the author's followers, so a refetched page brings the rest.
export function applyEdits(queryClient: QueryClient, account: string, cached: Post[], fetched: Post[]) {
  const editedAt = new Map(cached.map((p) => [p.id, p.editedAt]));
  for (const post of fetched) {
    if (!editedAt.has(post.id) || editedAt.get(post.id) === post.editedAt) continue;
    // The fetched copy may be a boost of a post cached on its own, or the reverse; each entry keeps its own wrapper.
    patchStatus(queryClient, account, post.id, (p) => ({
      ...post,
      key: p.key,
      cursor: p.cursor,
      sortAt: p.sortAt,
      repostedBy: p.repostedBy,
      wrapperId: p.wrapperId,
    }));
  }
}

// Undoes a failed action on one post, unless a newer action has changed the flag since.
export function revertAction(post: Post, action: StatusAction, active: boolean, before: Post): Post {
  const { flag, uri } = actionFields[action];
  if (post.viewer[flag] !== active) return post;
  const reverted = applyAction(post, action, !active);
  if (uri) reverted.viewer[uri] = before.viewer[uri];
  return reverted;
}

// Drops a deleted status, and boosts of it, from every cached list.
export function removeStatus(queryClient: QueryClient, account: string, id: string) {
  mapCachedStatuses(queryClient, account, (p) => (matches(p, id) ? null : p));
  queryClient.removeQueries({ queryKey: keys.status(account, id) });
}
