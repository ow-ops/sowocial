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

import { getBackend } from './backend';
import { capabilitiesFor } from './backend/capabilities';
import { stampAccount } from './clients';
import { keys } from './keys';
import { loadMixedPage, toMixedData, type MixedPage, type MixedParam } from './mixed';
import { byCursor, byMaxId, MAX_PAGES, refreshFirstPage } from './pagination';
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

export function useAccountHome(session: Session) {
  const key = accountKey(session);
  return useInfiniteQuery({
    queryKey: keys.accountHome(key),
    queryFn: ({ pageParam }) => fetchHome(key, pageParam),
    ...(capabilitiesFor(session.protocol).paging === 'cursor' ? byCursor : byMaxId),
  });
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
    select: toMixedData,
  });
}

export const mixedPendingId = (apKey: string, bskyKey: string) => `mixed:${apKey}:${bskyKey}`;

const time = (post: Post) => Date.parse(post.sortAt) || 0;

async function pollMixed(queryClient: QueryClient, apKey: string, bskyKey: string) {
  const queryKey = keys.mixedTimeline(apKey, bskyKey);
  const data = queryClient.getQueryData<InfiniteData<MixedPage>>(queryKey);
  const top = data?.pages[0]?.items[0];
  if (!top) return;

  const settled = await Promise.allSettled([fetchHome(apKey, undefined), fetchHome(bskyKey, undefined)]);
  const failed = settled.filter((r) => r.status === 'rejected');
  if (failed.length === settled.length) throw failed[0].reason;
  const id = mixedPendingId(apKey, bskyKey);
  const known = new Set([...data.pages.flatMap((p) => p.items), ...getPending(id)].map((p) => p.key));
  const unseen = settled
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((p) => !known.has(p.key) && time(p) > time(top));
  if (unseen.length === 0) return;
  setPending(id, [...unseen, ...getPending(id)].sort((a, b) => time(b) - time(a)));
}

export function useMixedPolling(apKey: string, bskyKey: string) {
  const queryClient = useQueryClient();
  const appActive = useAppActive();
  const focused = useIsFocused();
  const active = appActive && focused;

  useEffect(() => {
    if (!active) return;
    return startPolling(() => pollMixed(queryClient, apKey, bskyKey));
  }, [active, apKey, bskyKey, queryClient]);
}

export function showMixedPending(queryClient: QueryClient, apKey: string, bskyKey: string) {
  setPending(mixedPendingId(apKey, bskyKey), []);
  return refreshFirstPage(queryClient, keys.mixedTimeline(apKey, bskyKey));
}
