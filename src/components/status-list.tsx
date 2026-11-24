import type { FlashListRef } from '@shopify/flash-list';
import { useQueryClient, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useAccountHomePosition, type HomePosition } from '@/api/home-position';
import type { Timeline } from '@/api/keys';
import { showPending, usePending, usePendingOverflow } from '@/api/pending';
import { useLiveTimeline } from '@/api/timelines';
import type { LiveSource, TimelineSource } from '@/api/timeline-source';
import { accountKey, useAuthedSession } from '@/auth/session';
import { useGaps } from '@/components/gap-row';
import { InfiniteList } from '@/components/infinite-list';
import { NewPostsButton } from '@/components/new-posts-button';
import { StatusCard } from '@/components/status-card';
import { StatusRows } from '@/components/status-rows';
import { useHomeResume } from '@/hooks/use-home-resume';
import { useListHeaderHeight, usePillPosition } from '@/hooks/use-pill-position';
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
  const embeds = s.quote ? 'quote-' : s.card ? 'card-' : '';
  return `${s.gap ? 'gap-' : ''}${s.repostedBy ? 'reblog-' : ''}${filtered ? 'filtered' : `${embeds}${kind}`}`;
}

const statusItem = {
  keyExtractor: (s: Post) => s.key,
  getItemType: statusType,
  renderItem: (s: Post) => <StatusCard status={s} {...joinedLines(s)} />,
};

const sourceItem = {
  ...statusItem,
  renderItem: (s: Post) => <StatusCard status={s} showSource {...joinedLines(s)} />,
};

function useWaitingCount(source: LiveSource, pages: Post[][] | undefined) {
  const waiting = usePending(source.queryKey);
  const shown = useMemo(() => new Set(pages?.flat().map((s) => s.key)), [pages]);
  return waiting.filter((s) => !shown.has(s.key)).length;
}

export function StatusList({ gapSource, ...props }: Props & { gapSource?: TimelineSource }) {
  const listRef = useRef<FlashListRef<Post>>(null);
  const gaps = useGaps(gapSource, statusItem.renderItem);
  useStatusListShortcuts(props.query.data?.pages.flat() ?? [], listRef);
  return (
    <StatusRows>
      <InfiniteList {...props} {...statusItem} {...gaps} listRef={listRef} />
    </StatusRows>
  );
}

// A timeline that streams: new posts wait behind a button instead of shifting the list.
export function LiveStatusList({ timeline, ...props }: Props & { timeline: Timeline }) {
  const source = useLiveTimeline(timeline);
  const listRef = useRef<FlashListRef<Post>>(null);
  const scroll = useScrolling();
  const live = { ...props, source, listRef, scroll };
  return timeline === 'home' ? <AccountHomeList {...live} /> : <LiveList {...live} />;
}

type LiveProps = Props & {
  source: LiveSource;
  showSource?: boolean;
  listRef: RefObject<FlashListRef<Post> | null>;
  scroll: ReturnType<typeof useScrolling>;
};

function AccountHomeList(props: LiveProps) {
  // Resume state belongs to one account; a switch starts it over.
  return <HomeList key={accountKey(useAuthedSession())} position={useAccountHomePosition()} {...props} />;
}

export function HomeList({ position, ...props }: LiveProps & { position: HomePosition }) {
  const resume = useHomeResume(props.query, props.listRef, position);
  return <LiveList {...props} onVisibleChange={resume.onVisible} unread={resume.unread} />;
}

function LiveList({
  source,
  showSource = false,
  listRef,
  scroll,
  unread = 0,
  ...props
}: LiveProps & { unread?: number }) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  // Keeps the pills below the list header (the source switch on Home).
  const headerSize = useListHeaderHeight();
  const pill = usePillPosition(!!props.underTabs, Math.max(0, headerSize.height - scroll.offset));
  const header = props.header && <View onLayout={headerSize.onLayout}>{props.header}</View>;
  const item = showSource ? sourceItem : statusItem;
  const items = props.query.data?.pages.flat() ?? [];
  const gaps = useGaps(source, item.renderItem);
  const overflow = usePendingOverflow(source.queryKey);
  const count = useWaitingCount(source, props.query.data?.pages);
  const { showNew, keepPosition, onScroll: onJumpScroll } = useScrollToNew(listRef, items[0]?.key, () => {
    showPending(queryClient, source);
    return count > 0 || overflow;
  });
  useStatusListShortcuts(items, listRef, showNew);

  return (
    <View style={{ flex: 1 }}>
      <StatusRows>
        <InfiniteList
          {...props}
          header={header}
          listRef={listRef}
          {...item}
          {...gaps}
          queryKey={source.queryKey}
          onScroll={(e) => {
            scroll.onScroll(e);
            onJumpScroll(e);
          }}
          keepPosition={keepPosition}
        />
      </StatusRows>
      <NewPostsButton
        count={count + unread}
        more={overflow}
        position={pill}
        hidden={scroll.scrolling}
        onPress={count > 0 || overflow ? showNew : () => listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })}
      />
    </View>
  );
}
