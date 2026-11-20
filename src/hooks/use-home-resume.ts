import type { FlashListRef } from '@shopify/flash-list';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { HomePosition } from '@/api/home-position';
import { MAX_PAGES } from '@/api/pagination';
import { isNewer } from '@/api/snowflake';
import type { Post } from '@/model/post';

type Query = UseInfiniteQueryResult<InfiniteData<Post[]>>;

export function useHomeResume(query: Query, listRef: RefObject<FlashListRef<Post> | null>, hold: boolean, position: HomePosition) {
  const reduceMotion = useReducedMotion();
  const { of: positionOf, marker: saved, save } = position;
  const { data: marker, isFetchedAfterMount } = saved;
  const [start, setStart] = useState<string | null>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [target, setTarget] = useState<number | null>(null);

  if (isFetchedAfterMount && start === undefined) setStart(marker ?? null);

  const items = query.data?.pages.flat();
  const newest = items?.[0] && positionOf(items[0]);
  const offered = !!start && !!newest && !done && isNewer(newest, start);

  const latest = useRef({ items, marker, offered });
  useEffect(() => {
    latest.current = { items, marker, offered };
  });

  const count = items?.length ?? 0;
  useEffect(() => {
    if (target === null || count <= target) return;
    const frame = requestAnimationFrame(() => {
      void listRef.current?.scrollToIndex({ index: target, animated: !reduceMotion, viewPosition: 0 });
      setTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, count, listRef, reduceMotion]);

  const saveTop = useCallback(() => {
    const { items, marker, offered } = latest.current;
    const index = listRef.current?.computeVisibleIndices().startIndex;
    const post = index === undefined ? undefined : items?.[index];
    const id = post && positionOf(post);
    if (!id || id === marker || (offered && index === 0)) return;
    save(id);
  }, [listRef, save, positionOf]);

  useFocusEffect(useCallback(() => saveTop, [saveTop]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saveTop();
    });
    return () => subscription.remove();
  }, [saveTop]);

  const jump = async () => {
    if (!start) return;
    setLoading(true);
    try {
      let result = { data: query.data, hasNextPage: query.hasNextPage, isError: false };
      const reached = (data?: InfiniteData<Post[]>) => {
        const last = data?.pages.at(-1)?.at(-1);
        return !!last && !isNewer(positionOf(last), start);
      };
      while (result.data && !reached(result.data) && result.hasNextPage && result.data.pages.length < MAX_PAGES) {
        result = await query.fetchNextPage();
        if (result.isError) break;
      }
      const loaded = result.data?.pages.flat() ?? [];
      const found = loaded.findIndex((s) => !isNewer(positionOf(s), start));
      const index = found === -1 ? loaded.length - 1 : found;
      setDone(true);
      setTarget(Math.max(0, index));
    } finally {
      setLoading(false);
    }
  };

  const onVisible = (visible: Post[]) => {
    if (offered && start && visible.some((s) => !isNewer(positionOf(s), start))) setDone(true);
  };

  return { offered: offered && !hold, loading, jump: () => void jump(), dismiss: () => setDone(true), onVisible };
}
