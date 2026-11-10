import { useMutation, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { t } from '@/i18n';
import type { Post } from '@/model/post';
import { showError } from '@/utils/toast';

import { toPost } from '@/model/adapters/ap';

import { fetchTimelinePage } from './ap/backend';
import { getMasto } from './clients';
import { fillGap, mergeNewest } from './gaps';
import { keys, type Timeline } from './keys';
import type { MixedPage } from './mixed';
import { PAGE_SIZE, toFirstPage } from './pagination';

export type MinIdPage = (params: { minId?: string; maxId?: string }) => Promise<Post[]>;

// `since` is absent for sources that cannot be asked for "newer than" (Bluesky cursors): they never get gaps.
export type GapSource = {
  queryKey: QueryKey;
  since?: MinIdPage;
  refresh: (queryClient: QueryClient) => Promise<unknown>;
};

// `refetchQueries` swallows failures unless asked to throw, and a user-triggered refresh must report them.
export async function refreshOrThrow(queryClient: QueryClient, queryKey: QueryKey) {
  queryClient.setQueryData<InfiniteData<unknown>>(queryKey, (old) => old && toFirstPage(old));
  await queryClient.refetchQueries({ queryKey, exact: true }, { throwOnError: true });
}

export function gapSource(queryKey: QueryKey, page: MinIdPage | null): GapSource {
  if (!page) return { queryKey, refresh: (queryClient) => refreshOrThrow(queryClient, queryKey) };
  return {
    queryKey,
    since: page,
    refresh: async (queryClient) => {
      const data = queryClient.getQueryData<InfiniteData<Post[]>>(queryKey);
      // A trimmed list no longer starts at the newest post, so a merge would land in its middle.
      if (!data || data.pageParams[0] !== undefined) return refreshOrThrow(queryClient, queryKey);
      const fresh = await page({});
      queryClient.setQueryData<InfiniteData<Post[]>>(queryKey, (old) => (old ? mergeNewest(old, fresh) : old));
    },
  };
}

export const timelineSource = (timeline: Timeline, cursorPaged: boolean) =>
  gapSource(
    keys.timeline(timeline),
    cursorPaged ? null : (params) => fetchTimelinePage(getMasto().v1.timelines, timeline, params),
  );

// Only user-triggered callers pass `silent: false`; restore, mount and foreground catch-ups must not toast.
export async function catchUp(queryClient: QueryClient, source: GapSource, { silent = true } = {}) {
  try {
    await source.refresh(queryClient);
  } catch (error) {
    if (silent) console.warn('Background catch-up failed', error);
    else showError(t('timeline.gaps.refreshFailed'), error instanceof Error ? error.message : undefined);
  }
}

export function useFillGap(source: GapSource | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (post: Post) => {
      if (!source?.since || !post.gap) return;
      const fetched = await source.since({ minId: post.gap.sinceId });
      queryClient.setQueryData<InfiniteData<Post[] | MixedPage>>(source.queryKey, (old) =>
        old ? fillGap(old, post.key, fetched) : old,
      );
    },
  });
}

export const listSource = (id: string, cursorPaged: boolean) =>
  gapSource(
    keys.listTimeline(id),
    cursorPaged
      ? null
      : async (params) => (await getMasto().v1.timelines.list.$select(id).list({ limit: PAGE_SIZE, ...params })).map(toPost),
  );
