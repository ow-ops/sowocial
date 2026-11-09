import type { FlashListRef } from '@shopify/flash-list';
import { useIsFocused } from 'expo-router';
import { useEffect, type RefObject } from 'react';

import { useOpenStatus } from '@/hooks/use-open-status';
import type { Post } from '@/model/post';

import { registerList } from './focus-store';

export function useStatusListShortcuts(
  statuses: Post[],
  listRef: RefObject<FlashListRef<Post> | null>,
  showNew?: () => void,
) {
  const isFocused = useIsFocused();
  const open = useOpenStatus();

  useEffect(() => {
    if (!isFocused) return;
    return registerList({
      statuses,
      open: (status) => open(status, `/post/${status.id}`),
      scrollTo: (index) => {
        const list = listRef.current;
        if (!list) return;
        const { startIndex, endIndex } = list.computeVisibleIndices();
        if (index < startIndex || index > endIndex) void list.scrollToIndex({ index, viewPosition: 0.5 });
      },
      top: () => {
        showNew?.();
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    });
  }, [isFocused, statuses, open, listRef, showNew]);
}
