import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { createStore, useStore } from 'zustand';

import { accountKey, findSession, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { useAppActive } from '@/hooks/use-app-active';
import type { Post, Protocol } from '@/model/post';
import { readItem, writeItem } from '@/utils/kv';
import { HOME_SOURCE_KEY } from '@/utils/kv-keys';

import { fetchTimelinePage } from './ap/backend';
import { getBackend } from './backend';
import { catchUp, gapSource, refreshOrThrow, type GapSource, type MinIdPage } from './catch-up';
import { capabilitiesFor } from './backend/capabilities';
import { getMasto, stampAccount } from './clients';
import { mergeMixedNewest, unseenMixed } from './gaps';
import { keys } from './keys';
import { loadMixedPage, toMixedData, type MixedPage, type MixedParam } from './mixed';
import { byCursor, byMaxId, MAX_PAGES } from './pagination';
import { useCacheRestoring } from './persist';
import { getPending, setPending } from './pending';
import { startPolling } from './poll-backoff';

export type HomeSource = Protocol | 'mixed';

const STORAGE_KEY = HOME_SOURCE_KEY;

const isSource = (value: unknown): value is HomeSource => value === 'ap' || value === 'bsky' || value === 'mixed';

const stored = readItem(STORAGE_KEY);

export const homeSourceStore = createStore<{ source: HomeSource | null }>(() => ({
  source: isSource(stored) ? stored : null,
}));

export function setHomeSource(source: HomeSource) {
  writeItem(STORAGE_KEY, source);
  homeSourceStore.setState({ source });
}

export function pickAccount(sessions: Session[], active: Session | null, protocol: Protocol) {
  if (active?.protocol === protocol) return active;
  return [...sessions].reverse().find((s) => s.protocol === protocol) ?? null;
}

export function useHomeSources() {
  const { session, sessions } = useSession();
  const chosen = useStore(homeSourceStore, (s) => s.source);
  const ap = pickAccount(sessions, session, 'ap');
  const bsky = pickAccount(sessions, session, 'bsky');
  const source: HomeSource = chosen ?? session?.protocol ?? 'ap';
  return { accounts: ap && bsky ? { ap, bsky } : null, source, active: session ? accountKey(session) : null };
}

async function fetchHome(key: string, cursor: string | undefined) {
  if (!findSession(key)) throw new Error('Account is no longer signed in');
  return stampAccount(await getBackend(key).timelinePage('home', cursor), key);
}

export const accountHomeSource = (session: Session): GapSource => {
  const key = accountKey(session);
  const page: MinIdPage = async (params) => stampAccount(await fetchTimelinePage(getMasto(key).v1.timelines, 'home', params), key);
  return gapSource(keys.accountHome(key), session.protocol === 'ap' ? page : null);
};

export function useAccountHome(session: Session) {
  const key = accountKey(session);
  return useInfiniteQuery({
    queryKey: keys.accountHome(key),
    queryFn: ({ pageParam }) => fetchHome(key, pageParam),
    ...(capabilitiesFor(session.protocol).paging === 'cursor' ? byCursor : byMaxId),
    // A restored fediverse page is caught up by useAccountHomeCatchUp, which merges instead of replacing it.
    refetchOnMount: capabilitiesFor(session.protocol).paging === 'cursor',
  });
}

export function useAccountHomeCatchUp(session: Session) {
  const queryClient = useQueryClient();
  const restoring = useCacheRestoring();
  const appActive = useAppActive();
  const source = accountHomeSource(session);
  const active = source.since && appActive && !restoring;
  useEffect(() => {
    if (active) void catchUp(queryClient, source);
    // `source` is rebuilt every render for the same account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, accountKey(session), queryClient]);
}

export function useMixedTimeline(ap: Session, bsky: Session) {
  const apKey = accountKey(ap);
  const bskyKey = accountKey(bsky);
  return useInfiniteQuery({
    queryKey: keys.mixedTimeline(apKey, bskyKey),
    queryFn: ({ pageParam }) =>
      loadMixedPage(pageParam, {
        ap: (cursor) => fetchHome(apKey, cursor),
        bsky: (cursor) => fetchHome(bskyKey, cursor),
      }),
    initialPageParam: undefined as MixedParam | undefined,
    getNextPageParam: (last: MixedPage) => last.next,
    maxPages: MAX_PAGES,
    refetchOnWindowFocus: false,
    // A restored page is caught up by useMixedPolling, which offers the new posts behind the pill.
    refetchOnMount: false,
    select: toMixedData,
  });
}

export const mixedPendingId = (apKey: string, bskyKey: string) => `mixed:${apKey}:${bskyKey}`;

const time = (post: Post) => Date.parse(post.sortAt) || 0;

async function pollMixed(queryClient: QueryClient, apKey: string, bskyKey: string) {
  const queryKey = keys.mixedTimeline(apKey, bskyKey);
  const data = queryClient.getQueryData<InfiniteData<MixedPage>>(queryKey);
  if (!data?.pages[0]?.items[0]) return;

  const settled = await Promise.allSettled([fetchHome(apKey, undefined), fetchHome(bskyKey, undefined)]);
  const failed = settled.filter((r) => r.status === 'rejected');
  if (failed.length === settled.length) throw failed[0].reason;
  const id = mixedPendingId(apKey, bskyKey);
  const unseen = unseenMixed(
    data.pages.flatMap((p) => p.items),
    getPending(id),
    settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
  );
  if (unseen.length === 0) return;
  setPending(id, [...unseen, ...getPending(id)].sort((a, b) => time(b) - time(a)));
}

export function useMixedPolling(apKey: string, bskyKey: string) {
  const queryClient = useQueryClient();
  const restoring = useCacheRestoring();
  const appActive = useAppActive();
  const focused = useIsFocused();
  const active = appActive && focused && !restoring;

  useEffect(() => {
    if (!active) return;
    return startPolling(() => pollMixed(queryClient, apKey, bskyKey));
  }, [active, apKey, bskyKey, queryClient]);
}

// Fediverse posts that cannot be connected to the cached ones get a gap row; Bluesky has no "newer than",
// so when its page does not reach the cached top the first page is replaced.
export function mixedSource(apKey: string, bskyKey: string): GapSource {
  const queryKey = keys.mixedTimeline(apKey, bskyKey);
  const page: MinIdPage = async (params) => stampAccount(await fetchTimelinePage(getMasto(apKey).v1.timelines, 'home', params), apKey);
  return {
    queryKey,
    since: page,
    refresh: async (queryClient) => {
      const data = queryClient.getQueryData<InfiniteData<MixedPage>>(queryKey);
      if (!data || data.pageParams[0] !== undefined) return refreshOrThrow(queryClient, queryKey);
      const [ap, bsky] = await Promise.allSettled([page({}), fetchHome(bskyKey, undefined)]);
      if (ap.status === 'rejected' && bsky.status === 'rejected') throw ap.reason;
      const apPosts = ap.status === 'fulfilled' ? ap.value : null;
      const bskyPosts = bsky.status === 'fulfilled' ? bsky.value : null;
      // The decision is made on the data at hand, but the write merges into whatever the cache holds by now.
      const current = queryClient.getQueryData<InfiniteData<MixedPage>>(queryKey);
      if (!current || !mergeMixedNewest(current, apPosts, bskyPosts)) return refreshOrThrow(queryClient, queryKey);
      queryClient.setQueryData<InfiniteData<MixedPage>>(queryKey, (old) => (old && mergeMixedNewest(old, apPosts, bskyPosts)) || old);
    },
  };
}

export function showMixedPending(queryClient: QueryClient, apKey: string, bskyKey: string) {
  setPending(mixedPendingId(apKey, bskyKey), []);
  return catchUp(queryClient, mixedSource(apKey, bskyKey), { silent: false });
}
