import { useInfiniteQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';
import { toPost } from '@/model/adapters/ap';
import { arrangeTimeline } from '@/utils/timeline';

import { useTimelineLive, useTimelineStream } from './ap/streaming';
import { getBackend, useCapabilities } from './backend';
import { getMasto } from './clients';
import { keys, type NotificationFilter, type SavedKind, type Timeline } from './keys';
import { selectGrouped } from './notification-groups';
import { byPage, PAGE_SIZE, selectItems } from './pagination';
import { usePagedList } from './paged-list';
import { useSourcePolling } from './polling';
import { timelineSource } from './timeline-source';

export function useTimeline(timeline: Timeline) {
  const { paging } = useCapabilities();
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.timeline(account, timeline),
    queryFn: ({ pageParam }) => getBackend(account).timelinePage(timeline, pageParam),
    ...byPage,
    // A restored list is caught up by the stream (newer posts, or a gap); a refetch would replace it and skip posts.
    refetchOnMount: paging === 'cursor',
    select: arrangeTimeline,
  });
}

// The source behind a timeline that takes live posts, with the stream or poll that feeds it running.
export function useLiveTimeline(timeline: Timeline) {
  const { paging, streaming } = useCapabilities();
  const account = useAccountScope();
  const live = useTimelineLive(timeline);
  useTimelineStream(timeline);
  const source = timelineSource(account, timeline, paging === 'cursor');
  useSourcePolling(source, !streaming && live);
  return source;
}

export function useSavedStatuses(kind: SavedKind) {
  const { bookmarks, paging } = useCapabilities();
  const account = useAccountScope();
  const byCursorQuery = useInfiniteQuery({
    queryKey: keys.saved(account, kind),
    queryFn: ({ pageParam }) => getBackend(account).bookmarksPage(pageParam),
    ...byPage,
    select: selectItems,
    enabled: bookmarks && paging === 'cursor',
  });
  const pagedQuery = usePagedList(keys.saved(account, kind), () => getMasto(account).v1[kind].list({ limit: PAGE_SIZE }), toPost, bookmarks && paging === 'maxId');
  return paging === 'cursor' ? byCursorQuery : pagedQuery;
}

export function useNotifications(filter: NotificationFilter = 'all') {
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.notificationList(account, filter),
    queryFn: ({ pageParam }) => getBackend(account).notificationsPage(filter, pageParam),
    ...byPage,
    select: selectGrouped,
  });
}
