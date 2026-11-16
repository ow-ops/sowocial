import { useInfiniteQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';
import { toPost } from '@/model/adapters/ap';
import { arrangeTimeline } from '@/utils/timeline';

import { getBackend, useCapabilities } from './backend';
import { getMasto } from './clients';
import { keys, type NotificationFilter, type SavedKind, type Timeline } from './keys';
import { selectGrouped } from './notification-groups';
import { byCursor, PAGE_SIZE, pagingFor } from './pagination';
import { usePagedList } from './paged-list';

export function useTimeline(timeline: Timeline) {
  const { paging } = useCapabilities();
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.timeline(account, timeline),
    queryFn: ({ pageParam }) => getBackend(account).timelinePage(timeline, pageParam),
    ...pagingFor(paging),
    // A restored list is caught up by the stream (newer posts, or a gap); a refetch would replace it and skip posts.
    refetchOnMount: paging === 'cursor',
    select: arrangeTimeline,
  });
}

export function useSavedStatuses(kind: SavedKind) {
  const { bookmarks, paging } = useCapabilities();
  const account = useAccountScope();
  const byCursorQuery = useInfiniteQuery({
    queryKey: keys.saved(account, kind),
    queryFn: ({ pageParam }) => getBackend(account).bookmarksPage(pageParam),
    ...byCursor,
    enabled: bookmarks && paging === 'cursor',
  });
  const pagedQuery = usePagedList(keys.saved(account, kind), () => getMasto(account).v1[kind].list({ limit: PAGE_SIZE }), toPost, bookmarks && paging === 'maxId');
  return paging === 'cursor' ? byCursorQuery : pagedQuery;
}

export function useNotifications(filter: NotificationFilter = 'all') {
  const { paging } = useCapabilities();
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.notificationList(account, filter),
    queryFn: ({ pageParam }) => getBackend(account).notificationsPage(filter, pageParam),
    select: selectGrouped,
    ...pagingFor(paging),
  });
}
