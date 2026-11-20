import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { createStore, useStore } from 'zustand';

import { accountKey, findSession, onActiveAccount, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { useAppActive } from '@/hooks/use-app-active';
import { isHomeSource, type HomeSource, type Protocol } from '@/model/post';
import { usePref } from '@/prefs/store';
import { readItem, writeItem } from '@/utils/kv';
import { arrangeTimeline } from '@/utils/timeline';
import { HOME_ACCOUNTS_KEY, HOME_SOURCE_KEY } from '@/utils/kv-keys';

import { fetchTimelinePage } from './ap/backend';
import { getBackend } from './backend';
import { capabilitiesFor } from './backend/capabilities';
import { getMasto, stampAccount } from './clients';
import { mergeMixedNewest } from './gaps';
import { keys } from './keys';
import { loadMixedPage, selectMixed, type MixedPage, type MixedParam } from './mixed';
import { byPage, MAX_PAGES } from './pagination';
import { useCacheRestoring } from './persist';
import { useSourcePolling } from './polling';
import { catchUp, gapSource, refreshOrThrow, type LiveSource, type MinIdPage, type TimelineSource } from './timeline-source';

export type { HomeSource };

const STORAGE_KEY = HOME_SOURCE_KEY;

const stored = readItem(STORAGE_KEY);

export const homeSourceStore = createStore<{ source: HomeSource | null }>(() => ({
  source: isHomeSource(stored) ? stored : null,
}));

export function setHomeSource(source: HomeSource) {
  writeItem(STORAGE_KEY, source);
  homeSourceStore.setState({ source });
}

type HomeAccounts = Partial<Record<Protocol, string>>;

function storedAccounts(): HomeAccounts {
  try {
    const value: unknown = JSON.parse(readItem(HOME_ACCOUNTS_KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as HomeAccounts) : {};
  } catch {
    return {};
  }
}

// The account each network shows on Home when the active account is on the other network.
const homeAccountStore = createStore<HomeAccounts>(storedAccounts);

export function setHomeAccount(session: Session) {
  const next = { ...homeAccountStore.getState(), [session.protocol]: accountKey(session) };
  writeItem(HOME_ACCOUNTS_KEY, JSON.stringify(next));
  homeAccountStore.setState(next, true);
}

onActiveAccount(setHomeAccount);

export const useHomeAccount = (protocol: Protocol) => useStore(homeAccountStore, (s) => s[protocol]);

export function pickAccount(sessions: Session[], active: Session | null, protocol: Protocol, preferred?: string) {
  if (active?.protocol === protocol) return active;
  const chosen = preferred ? sessions.find((s) => accountKey(s) === preferred) : undefined;
  return chosen ?? [...sessions].reverse().find((s) => s.protocol === protocol) ?? null;
}

export function useHomeSources() {
  const { session, sessions } = useSession();
  const chosen = useStore(homeSourceStore, (s) => s.source);
  const ap = pickAccount(sessions, session, 'ap', useHomeAccount('ap'));
  const bsky = pickAccount(sessions, session, 'bsky', useHomeAccount('bsky'));
  const mixed = usePref('mixedTimeline');
  const fallback = session?.protocol ?? 'ap';
  const source: HomeSource = chosen === 'mixed' && !mixed ? fallback : (chosen ?? fallback);
  return { accounts: ap && bsky ? { ap, bsky } : null, source, mixed, active: session ? accountKey(session) : null };
}

async function fetchHome(key: string, cursor: string | undefined) {
  if (!findSession(key)) throw new Error('Account is no longer signed in');
  const page = await getBackend(key).timelinePage('home', cursor);
  return { ...page, items: stampAccount(page.items, key) };
}

export const accountHomeSource = (session: Session): TimelineSource => {
  const key = accountKey(session);
  const page: MinIdPage = async (params) => stampAccount(await fetchTimelinePage(getMasto(key).v1.timelines, 'home', params), key);
  return gapSource(keys.accountHome(key), session.protocol === 'ap' ? page : null);
};

export function useAccountHome(session: Session) {
  const key = accountKey(session);
  return useInfiniteQuery({
    queryKey: keys.accountHome(key),
    queryFn: ({ pageParam }) => fetchHome(key, pageParam),
    ...byPage,
    // A restored fediverse page is caught up by useAccountHomeCatchUp, which merges instead of replacing it.
    refetchOnMount: capabilitiesFor(session.protocol).paging === 'cursor',
    select: arrangeTimeline,
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
    // A restored page is caught up by the poll in useMixedSource, which offers the new posts behind the pill.
    refetchOnMount: false,
    select: selectMixed,
  });
}

// Fediverse posts that cannot be connected to the cached ones get a gap row; Bluesky has no "newer than",
// so when its page does not reach the cached top the first page is replaced.
function mixedSource(apKey: string, bskyKey: string): LiveSource {
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
      const bskyPosts = bsky.status === 'fulfilled' ? bsky.value.items : null;
      // The decision is made on the data at hand, but the write merges into whatever the cache holds by now.
      const current = queryClient.getQueryData<InfiniteData<MixedPage>>(queryKey);
      if (!current || !mergeMixedNewest(current, apPosts, bskyPosts)) return refreshOrThrow(queryClient, queryKey);
      queryClient.setQueryData<InfiniteData<MixedPage>>(queryKey, (old) => (old && mergeMixedNewest(old, apPosts, bskyPosts)) || old);
    },
    latest: async () => {
      const settled = await Promise.allSettled([fetchHome(apKey, undefined), fetchHome(bskyKey, undefined)]);
      const failed = settled.filter((r) => r.status === 'rejected');
      if (failed.length === settled.length) throw failed[0].reason;
      return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value.items : []));
    },
    mergesWaiting: false,
  };
}

export function useMixedSource(apKey: string, bskyKey: string) {
  const source = mixedSource(apKey, bskyKey);
  useSourcePolling(source, useIsFocused());
  return source;
}
