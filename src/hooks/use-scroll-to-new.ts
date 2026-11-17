import type { FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { Post } from '@/model/post';

const GIVE_UP_MS = 5000;

// Shows the waiting posts and brings the list to the newest. While they go in, the list stops keeping its place
// for the posts on screen, since on Android that adjustment cancels the scroll to the top; it resumes at the top.
export function useScrollToNew(listRef: RefObject<FlashListRef<Post> | null>, firstKey: string | undefined, show: () => void) {
  const reduceMotion = useReducedMotion();
  const [jumping, setJumping] = useState(false);
  const waiting = useRef(false);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = () => {
    waiting.current = false;
    if (giveUp.current) clearTimeout(giveUp.current);
    giveUp.current = null;
    setJumping(false);
  };

  useEffect(() => {
    if (!waiting.current) return;
    // Cleared once the frame runs, so a frame cancelled by another change of the top is scheduled again.
    const frame = requestAnimationFrame(() => {
      waiting.current = false;
      if ((listRef.current?.getAbsoluteLastScrollOffset() ?? 0) <= 1) finish();
      else listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    });
    return () => cancelAnimationFrame(frame);
  }, [firstKey, listRef, reduceMotion]);

  useEffect(() => () => {
    if (giveUp.current) clearTimeout(giveUp.current);
  }, []);

  return {
    showNew: () => {
      if (giveUp.current) clearTimeout(giveUp.current);
      giveUp.current = setTimeout(finish, GIVE_UP_MS);
      waiting.current = true;
      setJumping(true);
      show();
    },
    keepPosition: !jumping,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (jumping && !waiting.current && event.nativeEvent.contentOffset.y <= 1) finish();
    },
  };
}
