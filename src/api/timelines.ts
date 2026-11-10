import { useInfiniteQuery } from '@tanstack/react-query';

import { useForeignAccount } from '@/auth/session';
import { toPost } from '@/model/adapters/ap';

import { getBackend, useCapabilities } from './backend';
import { getMasto } from './clients';
import { keys, scoped, type NotificationFilter, type SavedKind, type Timeline } from './keys';
import { selectGrouped } from './notification-groups';
import { byCursor, PAGE_SIZE, pagingFor } from './pagination';
import { usePagedList } from './paged-list';

export function useTimeline(timeline: Timeline) {
  const { paging } = useCapabilities();
  const account = useForeignAccount();
  return useInfiniteQuery({
    queryKey: scoped(keys.timeline(timeline), account),
    queryFn: ({ pageParam }) => getBackend(account).timelinePage(timeline, pageParam),
    ...pagingFor(paging),
    // A restored list is caught up by the stream (newer posts, or a gap); a refetch would replace it and skip posts.
    refetchOnMount: paging === 'cursor',
  });
}

export function useSavedStatuses(kind: SavedKind) {
  const { bookmarks, paging } = useCapabilities();
  const byCursorQuery = useInfiniteQuery({
    queryKey: keys.saved(kind),
    queryFn: ({ pageParam }) => getBackend().bookmarksPage(pageParam),
    ...byCursor,
    enabled: bookmarks && paging === 'cursor',
  });
  const pagedQuery = usePagedList(keys.saved(kind), () => getMasto().v1[kind].list({ limit: PAGE_SIZE }), toPost, bookmarks && paging === 'maxId');
  return paging === 'cursor' ? byCursorQuery : pagedQuery;
}

export function useNotifications(filter: NotificationFilter = 'all') {
  const { paging } = useCapabilities();
  return useInfiniteQuery({
    queryKey: keys.notificationList(filter),
    queryFn: ({ pageParam }) => getBackend().notificationsPage(filter, pageParam),
    select: selectGrouped,
    ...pagingFor(paging),
  });
}
