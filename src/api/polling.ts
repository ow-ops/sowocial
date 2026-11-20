import { hashKey, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAppActive } from '@/hooks/use-app-active';
import type { Page } from '@/model/page';
import type { Post } from '@/model/post';

import { unseenPosts } from './gaps';
import { PAGE_SIZE } from './pagination';
import { useCacheRestoring } from './persist';
import { getPending, markOverflowed, setPending } from './pending';
import { startPolling } from './poll-backoff';
import type { LiveSource } from './timeline-source';

const time = (post: Post) => Date.parse(post.sortAt) || 0;

const newestFirst = (a: Post, b: Post) => time(b) - time(a);

export async function pollSource(queryClient: QueryClient, source: LiveSource) {
  const { queryKey } = source;
  const data = queryClient.getQueryData<InfiniteData<Page<Post, unknown>>>(queryKey);
  if (!data?.pages[0]?.items[0]) return;

  const latest = await source.latest();
  const waiting = getPending(queryKey);
  const unseen = unseenPosts(data.pages.flatMap((page) => page.items), waiting, latest);
  if (unseen.length === 0) return;
  if (unseen.length >= PAGE_SIZE) markOverflowed(queryKey);
  setPending(queryKey, [...unseen, ...waiting].sort(newestFirst));
}

export function useSourcePolling(source: LiveSource, enabled: boolean) {
  const queryClient = useQueryClient();
  const restoring = useCacheRestoring();
  const appActive = useAppActive();
  const active = enabled && appActive && !restoring;
  const id = hashKey(source.queryKey);

  useEffect(() => {
    if (!active) return;
    return startPolling(() => pollSource(queryClient, source));
    // `source` is rebuilt every render for the same timeline, which `id` identifies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id, queryClient]);
}
