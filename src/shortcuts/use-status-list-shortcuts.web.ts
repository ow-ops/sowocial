import type { FlashListRef } from '@shopify/flash-list';
import { useIsFocused } from 'expo-router';
import { useContext, useEffect, useRef, type RefObject } from 'react';

import { useOpenStatus } from '@/hooks/use-open-status';
import type { Post } from '@/model/post';

import { ColumnActiveContext } from './column-focus.web';
import { registerList } from './focus-store';

export function useStatusListShortcuts(
  statuses: Post[],
  listRef: RefObject<FlashListRef<Post> | null>,
  showNew?: () => void,
) {
  const isFocused = useIsFocused();
  const columnActive = useContext(ColumnActiveContext);
  const open = useOpenStatus();
  const latest = useRef({ statuses, open, showNew });
  useEffect(() => {
    latest.current = { statuses, open, showNew };
  });

  useEffect(() => {
    if (!isFocused || !columnActive) return;
    return registerList({
      get statuses() {
        return latest.current.statuses;
      },
      open: (status) => latest.current.open(status, `/post/${status.id}`),
      scrollTo: (index) => {
        const list = listRef.current;
        if (!list) return;
        const { startIndex, endIndex } = list.computeVisibleIndices();
        if (index < startIndex || index > endIndex) void list.scrollToIndex({ index, viewPosition: 0.5 });
      },
      top: () => {
        latest.current.showNew?.();
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    });
  }, [isFocused, columnActive, listRef]);
}
