import { useInfiniteQuery } from '@tanstack/react-query';

import { useForeignAccount } from '@/auth/session';
import { toPost } from '@/model/adapters/ap';

import { getBackend, useCapabilities } from './backend';
import { getMasto } from './clients';
import { keys, scoped, type NotificationFilter, type SavedKind, type Timeline } from './keys';
import { selectGrouped } from './notification-groups';
import { PAGE_SIZE, pagingFor } from './pagination';
import { usePagedList } from './paged-list';

export function useTimeline(timeline: Timeline) {
  const { paging } = useCapabilities();
  const account = useForeignAccount();
  return useInfiniteQuery({
    queryKey: scoped(keys.timeline(timeline), account),
    queryFn: ({ pageParam }) => getBackend(account).timelinePage(timeline, pageParam),
    ...pagingFor(paging),
  });
}

export function useSavedStatuses(kind: SavedKind) {
  const { bookmarks } = useCapabilities();
  return usePagedList(keys.saved(kind), () => getMasto().v1[kind].list({ limit: PAGE_SIZE }), toPost, bookmarks);
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
