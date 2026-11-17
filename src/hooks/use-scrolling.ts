import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE_MS = 600;

// True while the list moves, and for a moment after it stops.
export function useScrolling() {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onScroll = useCallback(() => {
    setScrolling(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setScrolling(false), IDLE_MS);
  }, []);
  return { scrolling, onScroll };
}
