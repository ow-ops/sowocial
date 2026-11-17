import type { FlashListRef } from '@shopify/flash-list';
import { useQueryClient, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { useRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { useAccountScope } from '@/auth/session';
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
import { useListHeaderHeight, usePillPosition, type PillPosition } from '@/hooks/use-pill-position';
import { useScrollToNew } from '@/hooks/use-scroll-to-new';
import { useScrolling } from '@/hooks/use-scrolling';
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
  const scroll = useScrolling();
  return timeline === 'home' ? (
    <HomeStatusList timeline={timeline} listRef={listRef} scroll={scroll} {...props} />
  ) : (
    <LiveList timeline={timeline} listRef={listRef} scroll={scroll} {...props} />
  );
}

type LiveProps = Props & {
  timeline: Timeline;
  listRef: RefObject<FlashListRef<Post> | null>;
  scroll: ReturnType<typeof useScrolling>;
};

function HomeStatusList(props: LiveProps) {
  const { t } = useTranslation();
  const hasPending = useWaitingCount(props.timeline, props.query.data?.pages) > 0;
  const resume = useHomeResume(props.query, props.listRef, hasPending);
  return (
    <LiveList {...props} onVisibleChange={resume.onVisible}>
      {(pill) =>
        resume.offered && (
          <JumpButton
            label={t('timeline.home.resume')}
            loading={resume.loading}
            position={pill}
            hidden={props.scroll.scrolling}
            onPress={resume.jump}
            onDismiss={resume.dismiss}
          />
        )
      }
    </LiveList>
  );
}

function LiveList({
  timeline,
  listRef,
  scroll,
  children,
  ...props
}: LiveProps & { children?: (pill: PillPosition) => ReactNode }) {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  // Keeps the pills below the list header (the source switch on Home).
  const headerSize = useListHeaderHeight();
  const pill = usePillPosition(!!props.underTabs, Math.max(0, headerSize.height - scroll.offset));
  const header = props.header && <View onLayout={headerSize.onLayout}>{props.header}</View>;
  useTimelineStream(timeline);
  useTimelinePolling(timeline);
  const items = props.query.data?.pages.flat() ?? [];
  const source = timelineSource(account, timeline, useCapabilities().paging === 'cursor');
  const gaps = useGaps(source, statusItem.renderItem);
  const showNew = useScrollToNew(listRef, items[0]?.key, () => {
    if (showPending(queryClient, account, timeline)) void catchUp(queryClient, source, { silent: false });
  });
  useStatusListShortcuts(items, listRef, showNew);

  const overflow = usePendingOverflow(timeline);
  const count = useWaitingCount(timeline, props.query.data?.pages);

  return (
    <View style={{ flex: 1 }}>
      <InfiniteList
        {...props}
        header={header}
        listRef={listRef}
        {...statusItem}
        {...gaps}
        queryKey={keys.timeline(account, timeline)}
        onScroll={scroll.onScroll}
      />
      <NewPostsButton
        count={count}
        more={overflow}
        position={pill}
        hidden={scroll.scrolling}
        onPress={showNew}
      />
      {children?.(pill)}
    </View>
  );
}
