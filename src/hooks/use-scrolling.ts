import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const IDLE_MS = 600;

// True while the list moves, and for a moment after it stops; offset is how far it had scrolled when it stopped.
export function useScrolling() {
  const [scrolling, setScrolling] = useState(false);
  const [offset, setOffset] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onScroll = useCallback((event?: NativeSyntheticEvent<NativeScrollEvent>) => {
    // On iOS the content starts at minus the large title's inset.
    const y = event ? event.nativeEvent.contentOffset.y + (event.nativeEvent.contentInset?.top ?? 0) : 0;
    setScrolling(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setScrolling(false);
      setOffset(Math.max(0, y));
    }, IDLE_MS);
  }, []);
  return { scrolling, offset, onScroll };
}
