import { useMutation, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { t } from '@/i18n';
import { toPost } from '@/model/adapters/ap';
import type { Page } from '@/model/page';
import type { Post } from '@/model/post';
import { showError } from '@/utils/toast';

import { fetchTimelinePage } from './ap/backend';
import { getBackend } from './backend';
import { getMasto } from './clients';
import { fillGap, mergeNewest } from './gaps';
import { keys, type Timeline } from './keys';
import { PAGE_SIZE, toFirstPage } from './pagination';

export type MinIdPage = (params: { minId?: string; maxId?: string }) => Promise<Post[]>;

// What a list needs from the timeline behind it. `since` is absent for sources that cannot be asked
// for "newer than" (Bluesky cursors): they never get gaps.
export type TimelineSource = {
  queryKey: QueryKey;
  since?: MinIdPage;
  refresh: (queryClient: QueryClient) => Promise<unknown>;
};

// A timeline that takes live posts: `latest` is its newest page, and posts waiting for the reader can
// go straight into the cache only when `mergesWaiting`; otherwise showing them means catching up.
export type LiveSource = TimelineSource & {
  latest: () => Promise<Post[]>;
  mergesWaiting: boolean;
};

// `refetchQueries` swallows failures unless asked to throw, and a user-triggered refresh must report them.
export async function refreshOrThrow(queryClient: QueryClient, queryKey: QueryKey) {
  queryClient.setQueryData<InfiniteData<unknown>>(queryKey, (old) => old && toFirstPage(old));
  await queryClient.refetchQueries({ queryKey, exact: true }, { throwOnError: true });
}

export function gapSource(queryKey: QueryKey, page: MinIdPage | null): TimelineSource {
  if (!page) return { queryKey, refresh: (queryClient) => refreshOrThrow(queryClient, queryKey) };
  return {
    queryKey,
    since: page,
    refresh: async (queryClient) => {
      const data = queryClient.getQueryData<InfiniteData<Page<Post>>>(queryKey);
      // A trimmed list no longer starts at the newest post, so a merge would land in its middle.
      if (!data || data.pageParams[0] !== undefined) return refreshOrThrow(queryClient, queryKey);
      const fresh = await page({});
      queryClient.setQueryData<InfiniteData<Page<Post>>>(queryKey, (old) => (old ? mergeNewest(old, fresh) : old));
    },
  };
}

export const timelineSource = (account: string, timeline: Timeline, cursorPaged: boolean): LiveSource => ({
  ...gapSource(
    keys.timeline(account, timeline),
    cursorPaged ? null : (params) => fetchTimelinePage(getMasto(account).v1.timelines, timeline, params),
  ),
  latest: async () => (await getBackend(account).timelinePage(timeline)).items,
  mergesWaiting: true,
});

// Only user-triggered callers pass `silent: false`; restore, mount and foreground catch-ups must not toast.
export async function catchUp(queryClient: QueryClient, source: TimelineSource, { silent = true } = {}) {
  try {
    await source.refresh(queryClient);
  } catch (error) {
    if (silent) console.warn('Background catch-up failed', error);
    else showError(t('timeline.gaps.refreshFailed'), error instanceof Error ? error.message : undefined);
  }
}

export function useFillGap(source: TimelineSource | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (post: Post) => {
      if (!source?.since || !post.gap) return;
      const fetched = await source.since({ minId: post.gap.sinceId });
      queryClient.setQueryData<InfiniteData<Page<Post, unknown>>>(source.queryKey, (old) =>
        old ? fillGap(old, post.key, fetched) : old,
      );
    },
  });
}

export const listSource = (account: string, id: string, cursorPaged: boolean) =>
  gapSource(
    keys.listTimeline(account, id),
    cursorPaged
      ? null
      : async (params) => (await getMasto(account).v1.timelines.list.$select(id).list({ limit: PAGE_SIZE, ...params })).map(toPost),
  );
