import type { FlashListRef } from '@shopify/flash-list';
import { useQueryClient, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { useRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { keys, type Timeline } from '@/api/keys';
import { showPending, usePendingOverflow, usePendingStatuses } from '@/api/pending';
import { useTimelinePolling } from '@/api/polling';
import { useTimelineStream } from '@/api/ap/streaming';
import { catchUp, timelineSource, type GapSource } from '@/api/catch-up';
import { useGaps } from '@/components/gap-row';
import { InfiniteList } from '@/components/infinite-list';
import { JumpButton } from '@/components/jump-button';
import { NewPostsButton } from '@/components/new-posts-button';
import { StatusCard } from '@/components/status-card';
import { useHomeResume } from '@/hooks/use-home-resume';
import { usePillTop } from '@/hooks/use-pill-top';
import { useScrollToNew } from '@/hooks/use-scroll-to-new';
import type { Post } from '@/model/post';
import { useStatusListShortcuts } from '@/shortcuts/use-status-list-shortcuts';
import { joinedLines } from '@/utils/timeline';

type Props = {
  query: UseInfiniteQueryResult<InfiniteData<Post[]>>;
  emptyText: string;
  header?: ReactElement;
  underTabs?: boolean;
  queryKey?: QueryKey;
  title?: string;
  onVisibleChange?: (items: Post[]) => void;
};

function statusType(s: Post) {
  const kind = s.contentWarning ? 'cw' : s.poll ? 'poll' : s.media.length > 0 ? 'media' : 'text';
  const filtered = (s.filters ?? []).length > 0;
  return `${s.gap ? 'gap-' : ''}${s.repostedBy ? 'reblog-' : ''}${filtered ? 'filtered' : kind}`;
}

const statusItem = {
  keyExtractor: (s: Post) => s.key,
  getItemType: statusType,
  renderItem: (s: Post) => <StatusCard status={s} {...joinedLines(s)} />,
};

function useWaitingCount(timeline: Timeline, pages: Post[][] | undefined) {
  const waiting = usePendingStatuses(timeline);
  const shown = new Set(pages?.flat().map((s) => s.key));
  return waiting.filter((s) => !shown.has(s.key)).length;
}

export function StatusList({ gapSource, ...props }: Props & { gapSource?: GapSource }) {
  const listRef = useRef<FlashListRef<Post>>(null);
  const gaps = useGaps(gapSource, statusItem.renderItem);
  useStatusListShortcuts(props.query.data?.pages.flat() ?? [], listRef);
  return <InfiniteList {...props} {...statusItem} {...gaps} listRef={listRef} />;
}

// A timeline that streams: new posts wait behind a button instead of shifting the list.
export function LiveStatusList({ timeline, ...props }: Props & { timeline: Timeline }) {
  const listRef = useRef<FlashListRef<Post>>(null);
  const { markers } = useCapabilities();
  return timeline === 'home' && markers ? (
    <HomeStatusList timeline={timeline} listRef={listRef} {...props} />
  ) : (
    <LiveList timeline={timeline} listRef={listRef} {...props} />
  );
}

type LiveProps = Props & { timeline: Timeline; listRef: RefObject<FlashListRef<Post> | null> };

function HomeStatusList(props: LiveProps) {
  const { t } = useTranslation();
  const hasPending = useWaitingCount(props.timeline, props.query.data?.pages) > 0;
  const resume = useHomeResume(props.query, props.listRef, hasPending);
  const pillTop = usePillTop(!!props.underTabs);
  return (
    <LiveList {...props} onVisibleChange={resume.onVisible}>
      {resume.offered && (
        <JumpButton
          label={t('timeline.home.resume')}
          loading={resume.loading}
          top={pillTop}
          onPress={resume.jump}
        />
      )}
    </LiveList>
  );
}

function LiveList({ timeline, listRef, children, ...props }: LiveProps & { children?: ReactNode }) {
  const queryClient = useQueryClient();
  const pillTop = usePillTop(!!props.underTabs);
  useTimelineStream(timeline);
  useTimelinePolling(timeline);
  const items = props.query.data?.pages.flat() ?? [];
  const source = timelineSource(timeline, useCapabilities().paging === 'cursor');
  const gaps = useGaps(source, statusItem.renderItem);
  const showNew = useScrollToNew(listRef, items[0]?.key, () => {
    if (showPending(queryClient, timeline)) void catchUp(queryClient, source, { silent: false });
  });
  useStatusListShortcuts(items, listRef, showNew);

  const overflow = usePendingOverflow(timeline);
  const count = useWaitingCount(timeline, props.query.data?.pages);

  return (
    <View style={{ flex: 1 }}>
      <InfiniteList
        {...props}
        listRef={listRef}
        {...statusItem}
        {...gaps}
        queryKey={keys.timeline(timeline)}
      />
      <NewPostsButton
        count={count}
        more={overflow}
        top={pillTop}
        onPress={showNew}
      />
      {children}
    </View>
  );
}
