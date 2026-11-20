import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { type GestureResponderEvent, Platform, Pressable } from 'react-native';

import { useScreenReader } from '@/hooks/use-screen-reader';
import type { Post } from '@/model/post';
import { tapHaptic } from '@/utils/haptics';
import { selectingText } from '@/utils/text-selection';

const DOUBLE_TAP_MS = 250;

type Tap = { x?: number; y?: number };

export function useDoubleTapLike(
  status: Post,
  ref: RefObject<ComponentRef<typeof Pressable> | null>,
  onSingle: () => void,
  onLike: (tap: Tap) => void,
  like: () => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastDouble = useRef(0);
  const screenReader = useScreenReader();

  useEffect(() => () => clearTimeout(timer.current), []);

  return (event: GestureResponderEvent) => {
    // react-native-web always reports a screen reader; web waits like native so a double-click can select a word.
    if (screenReader && Platform.OS !== 'web') return onSingle();

    const { pageX, pageY } = event.nativeEvent;
    const now = Date.now();
    if (timer.current || now - lastDouble.current < DOUBLE_TAP_MS) {
      clearTimeout(timer.current);
      timer.current = undefined;
      lastDouble.current = now;
      // On web a double-click selects text, so it does not like the post.
      if (Platform.OS === 'web') return;
      tapHaptic();
      if (!status.viewer.liked) like();
      if (typeof pageX === 'number' && typeof pageY === 'number' && ref.current) {
        ref.current.measureInWindow((left, top) => onLike({ x: pageX - left, y: pageY - top }));
      } else {
        onLike({});
      }
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (!selectingText()) onSingle();
    }, DOUBLE_TAP_MS);
  };
}
