import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAppActive } from '@/hooks/use-app-active';
import type { Post } from '@/model/post';

import { getBackend, useCapabilities } from './backend';
import { keys, type Timeline } from './keys';
import { PAGE_SIZE } from './pagination';
import { getPending, idOf, markOverflowed, setPending } from './pending';
import { startPolling } from './poll-backoff';
import { useTimelineLive } from './ap/streaming';

const newestFirst = (a: Post, b: Post) => (a.sortAt < b.sortAt ? 1 : -1);

async function pollForNewPosts(queryClient: QueryClient, timeline: Timeline) {
  const key = keys.timeline(timeline);
  const data = queryClient.getQueryData<InfiniteData<Post[]>>(key);
  const top = data?.pages[0]?.[0];
  if (!top) return;

  const latest = await getBackend().timelinePage(timeline);
  const id = idOf(timeline);
  const known = new Set([...data.pages.flat(), ...getPending(id)].map((p) => p.key));
  const unseen = latest.filter((p) => !known.has(p.key) && p.sortAt > top.sortAt);
  if (unseen.length === 0) return;
  if (unseen.length >= PAGE_SIZE) markOverflowed(id);
  setPending(id, [...unseen, ...getPending(id)].sort(newestFirst));
}

export function useTimelinePolling(timeline: Timeline) {
  const { streaming } = useCapabilities();
  const queryClient = useQueryClient();
  const appActive = useAppActive();
  const live = useTimelineLive(timeline);
  const active = !streaming && appActive && live;
  const id = idOf(timeline);

  useEffect(() => {
    if (!active) return;
    return startPolling(() => pollForNewPosts(queryClient, timeline));
    // `timeline` is identified by `id`; a new object for the same tag must not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id, queryClient]);
}
