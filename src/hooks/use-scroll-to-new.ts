import type { FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import type { Post } from '@/model/post';

const GIVE_UP_MS = 5000;

export function useScrollToNew(listRef: RefObject<FlashListRef<Post> | null>, firstKey: string | undefined, show: () => void) {
  const reduceMotion = useReducedMotion();
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!waiting.current) return;
    clearTimeout(waiting.current);
    waiting.current = null;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion }));
    return () => cancelAnimationFrame(frame);
  }, [firstKey, listRef, reduceMotion]);

  return () => {
    if (waiting.current) clearTimeout(waiting.current);
    waiting.current = setTimeout(() => (waiting.current = null), GIVE_UP_MS);
    show();
  };
}
