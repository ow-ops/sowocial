import type { FlashListRef } from '@shopify/flash-list';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';

import type { HomePosition } from '@/api/home-position';
import { MAX_PAGES } from '@/api/pagination';
import { isNewer } from '@/api/snowflake';
import { useColumn } from '@/hooks/use-column';
import type { Post } from '@/model/post';

type Query = UseInfiniteQueryResult<InfiniteData<Post[]>>;

// Opens Home on the last post read and counts the newer posts above what is on screen.
export function useHomeResume(query: Query, listRef: RefObject<FlashListRef<Post> | null>, position: HomePosition) {
  const { of: positionOf, marker: saved, save } = position;
  const { tabBarInset } = useColumn();
  const { data: marker, isFetchedAfterMount } = saved;
  const [start, setStart] = useState<string | null>();
  const [resuming, setResuming] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  // The highest row reached since resuming; scrolling back down does not make posts unread again.
  const [reached, setReached] = useState<number | null>(null);

  if (isFetchedAfterMount && start === undefined) setStart(marker ?? null);

  const items = query.data?.pages.flat();
  const newest = items?.[0] && positionOf(items[0]);
  const behind = !!start && !!newest && isNewer(newest, start);

  const latest = useRef({ items, marker, query, resuming });
  useEffect(() => {
    latest.current = { items, marker, query, resuming };
  });

  const [tried, setTried] = useState(false);
  if (behind && !tried) {
    setTried(true);
    setResuming(true);
  }

  useEffect(() => {
    if (!resuming || !start) return;
    let cancelled = false;
    const loadedPast = (data?: InfiniteData<Post[]>) => {
      const last = data?.pages.at(-1)?.at(-1);
      return !!last && !isNewer(positionOf(last), start);
    };
    void (async () => {
      const { query } = latest.current;
      let result = { data: query.data, hasNextPage: query.hasNextPage, isError: false };
      while (result.data && !loadedPast(result.data) && result.hasNextPage && result.data.pages.length < MAX_PAGES) {
        result = await query.fetchNextPage();
        if (result.isError) break;
      }
      if (cancelled) return;
      const loaded = result.data?.pages.flat() ?? [];
      const found = loaded.findIndex((s) => !isNewer(positionOf(s), start));
      setTarget(found === -1 ? loaded.length - 1 : found);
    })();
    return () => {
      cancelled = true;
    };
  }, [resuming, start, positionOf]);

  const count = items?.length ?? 0;
  useEffect(() => {
    if (target === null || count <= target) return;
    const frame = requestAnimationFrame(() => {
      // Someone who already scrolled is reading; the list stays where they took it.
      if ((listRef.current?.getAbsoluteLastScrollOffset() ?? 0) <= 1) {
        // On web the tabs float over the list, so the last post read lands below them.
        void listRef.current?.scrollToIndex({ index: target, animated: false, viewPosition: 0, viewOffset: -tabBarInset });
        setReached(target);
      }
      setTarget(null);
      setResuming(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, count, listRef, tabBarInset]);

  const saveTop = useCallback(() => {
    const { items, marker, resuming } = latest.current;
    const index = listRef.current?.computeVisibleIndices().startIndex;
    const post = index === undefined ? undefined : items?.[index];
    const id = post && positionOf(post);
    if (!id || id === marker || resuming) return;
    save(id);
  }, [listRef, save, positionOf]);

  useFocusEffect(useCallback(() => saveTop, [saveTop]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saveTop();
    });
    return () => subscription.remove();
  }, [saveTop]);

  const onVisible = (visible: Post[]) => {
    const first = visible[0];
    const index = first && items ? items.findIndex((s) => s.key === first.key) : -1;
    if (index !== -1 && reached !== null && index < reached) setReached(index);
  };

  const unread = start && items && reached ? items.slice(0, reached).filter((s) => isNewer(positionOf(s), start)).length : 0;

  return { unread, onVisible };
}
