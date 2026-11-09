import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { AccessibilityInfo, type GestureResponderEvent, Pressable } from 'react-native';

import { useStatusAction } from '@/api/statuses';
import type { Post } from '@/model/post';
import { tapHaptic } from '@/utils/haptics';

const DOUBLE_TAP_MS = 250;

type Tap = { x?: number; y?: number };

export function useDoubleTapLike(
  status: Post,
  ref: RefObject<ComponentRef<typeof Pressable> | null>,
  onSingle: () => void,
  onLike: (tap: Tap) => void,
) {
  const { mutate } = useStatusAction();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastDouble = useRef(0);
  const screenReader = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then((on) => (screenReader.current = on));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => (screenReader.current = on));
    return () => {
      sub.remove();
      clearTimeout(timer.current);
    };
  }, []);

  return (event: GestureResponderEvent) => {
    if (screenReader.current) return onSingle();

    const { pageX, pageY } = event.nativeEvent;
    const now = Date.now();
    if (timer.current || now - lastDouble.current < DOUBLE_TAP_MS) {
      clearTimeout(timer.current);
      timer.current = undefined;
      lastDouble.current = now;
      tapHaptic();
      if (!status.viewer.liked) mutate({ status, action: 'favourite' });
      if (typeof pageX === 'number' && typeof pageY === 'number' && ref.current) {
        ref.current.measureInWindow((left, top) => onLike({ x: pageX - left, y: pageY - top }));
      } else {
        onLike({});
      }
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      onSingle();
    }, DOUBLE_TAP_MS);
  };
}
