import type { Agent } from '@atproto/api';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBskyAgent } from '@/auth/bsky-loader';
import { accountKey, useAccountScope, useAuthedSession } from '@/auth/session';
import { bskySavedFeeds, bskyUpdateSavedFeed, type SavedFeedAction } from './feed-data';
import { bskyPreferencesQuery } from './moderation';
import { useBsky } from '../client';
import { getAgent, getBskySession } from '../clients';
import { keys } from '../keys';
import { byCursor } from '../pagination';
import { handlesError } from '../mutation-meta';

const FEED_DISCOVERY_COUNT = 25;

function usePreferences() {
  const agent = useBsky();
  return bskyPreferencesQuery(agent, accountKey(useAuthedSession()));
}

export function useSavedFeeds() {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyFeeds(account),
    queryFn: async () => {
      const session = getBskySession(account);
      const agent = getBskyAgent(session);
      const preferences = await queryClient.fetchQuery(bskyPreferencesQuery(agent, accountKey(session)));
      return bskySavedFeeds(agent, preferences.savedFeeds);
    },
  });
}

export function useFeedTimeline(uri: string) {
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.feedTimeline(account, uri),
    queryFn: async ({ pageParam }) => (await import('./feed-page')).bskyFeedPage(getAgent(account), uri, pageParam),
    ...byCursor,
  });
}

export function useFeedGenerator(uri: string) {
  const agent = useBsky();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyFeed(account, uri),
    queryFn: async () => (await agent.app.bsky.feed.getFeedGenerator({ feed: uri })).data,
  });
}

export function useSuggestedFeeds() {
  const agent = useBsky();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskySuggestedFeeds(account),
    queryFn: async () => (await agent.app.bsky.feed.getSuggestedFeeds({ limit: FEED_DISCOVERY_COUNT })).data.feeds,
  });
}

export function useFeedSearch(query: string) {
  const agent = useBsky();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyFeedSearch(account, query),
    queryFn: async () =>
      (await agent.app.bsky.unspecced.getPopularFeedGenerators({ query, limit: FEED_DISCOVERY_COUNT })).data.feeds,
    enabled: query.length > 0,
  });
}

export function useIsSavedFeed(uri: string) {
  const { data } = useSavedFeeds();
  return data?.find((e) => e.saved.value === uri)?.saved;
}

export function useUpdateSavedFeed(uri: string) {
  const agent = useBsky();
  const queryClient = useQueryClient();
  const account = useAccountScope();
  const preferences = usePreferences();
  return useMutation({
    meta: handlesError,
    mutationFn: (action: SavedFeedAction) => bskyUpdateSavedFeed(agent, uri, action),
    onSuccess: (savedFeeds) => {
      queryClient.setQueryData(preferences.queryKey, (old: Awaited<ReturnType<Agent['getPreferences']>> | undefined) =>
        old && { ...old, savedFeeds },
      );
      return queryClient.invalidateQueries({ queryKey: keys.bskyFeeds(account) });
    },
  });
}
