import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { Notification, Post } from '@/model/post';

import { keys } from './keys';
import type { MixedPage } from './mixed';

// Every query that holds statuses must live under one of these roots, or actions
// like favourite won't update it.
const LIST_ROOTS = [keys.timelines, keys.accountStatusesAll];
const STATUS_ROOTS = [...LIST_ROOTS, keys.threads, keys.statuses, keys.notifications];

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

function mapCachedStatuses(queryClient: QueryClient, fn: (s: Post) => Post | null) {
  const mapList = (list: Post[]) => list.flatMap((s) => fn(s) ?? []);
  const mapPages = (data?: InfiniteData<Post[] | MixedPage>) => {
    if (!data) return data;
    const mapped = mapKeepingGaps(data.pages.map((page) => (Array.isArray(page) ? page : page.items)), fn);
    return {
      ...data,
      pages: data.pages.map((page, i) =>
        Array.isArray(page)
          ? mapped[i]
          : { ...page, items: mapped[i], next: page.next && { ...page.next, carry: mapList(page.next.carry) } },
      ),
    };
  };

  for (const queryKey of LIST_ROOTS) queryClient.setQueriesData({ queryKey }, mapPages);
  queryClient.setQueriesData<ThreadData>({ queryKey: keys.threads }, (data) =>
    data && { ancestors: mapList(data.ancestors), descendants: mapList(data.descendants) },
  );
  queryClient.setQueriesData<Post>({ queryKey: keys.statuses }, (data) => data && (fn(data) ?? data));
  queryClient.setQueriesData<InfiniteData<Notification[]>>(
    { queryKey: keys.notifications },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) =>
          p.flatMap((n) => {
            if (!n.post) return n;
            const post = fn(n.post);
            return post ? { ...n, post } : [];
          }),
        ),
      },
  );
}

const matches = (p: Post, id: string) => p.id === id || p.wrapperId === id;

export function patchStatus(queryClient: QueryClient, id: string, update: (p: Post) => Post) {
  mapCachedStatuses(queryClient, (p) => {
    if (!matches(p, id)) return p;
    const updated = update(p);
    const next = { ...updated, ...(p.accountKey && { accountKey: p.accountKey }), ...(p.gap && { gap: p.gap }) };
    if (!p.repostedBy) return next;
    return { ...next, key: p.key, cursor: p.cursor, sortAt: p.sortAt, repostedBy: p.repostedBy, wrapperId: p.wrapperId };
  });
}

export type Snapshot = [QueryKey, unknown][];

export async function snapshotStatusCaches(queryClient: QueryClient): Promise<Snapshot> {
  await Promise.all(STATUS_ROOTS.map((queryKey) => queryClient.cancelQueries({ queryKey })));
  return STATUS_ROOTS.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }));
}

export function restoreSnapshot(queryClient: QueryClient, snapshot: Snapshot) {
  for (const [queryKey, data] of snapshot) queryClient.setQueryData(queryKey, data);
}

// Drops a deleted status, and boosts of it, from every cached list.
export function removeStatus(queryClient: QueryClient, id: string) {
  mapCachedStatuses(queryClient, (p) => (matches(p, id) ? null : p));
  queryClient.removeQueries({ queryKey: keys.status(id) });
}
