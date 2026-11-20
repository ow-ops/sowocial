import type { Agent } from '@atproto/api';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';
import { bskySavedFeeds, bskyUpdateSavedFeed, type SavedFeedAction } from './feed-data';
import { bskyPreferencesQuery } from './moderation';
import { getAgent } from '../clients';
import { keys } from '../keys';
import { byPage, selectItems } from '../pagination';
import { handlesError } from '../mutation-meta';

const FEED_DISCOVERY_COUNT = 25;

export function useSavedFeeds() {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyFeeds(account),
    queryFn: async () => {
      const preferences = await queryClient.fetchQuery(bskyPreferencesQuery(account));
      return bskySavedFeeds(getAgent(account), preferences.savedFeeds);
    },
  });
}

export function useFeedTimeline(uri: string) {
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.feedTimeline(account, uri),
    queryFn: async ({ pageParam }) => (await import('./feed-page')).bskyFeedPage(getAgent(account), uri, pageParam),
    ...byPage,
    select: selectItems,
  });
}

export function useFeedGenerator(uri: string) {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyFeed(account, uri),
    queryFn: async () => (await getAgent(account).app.bsky.feed.getFeedGenerator({ feed: uri })).data,
  });
}

export function useSuggestedFeeds() {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskySuggestedFeeds(account),
    queryFn: async () => (await getAgent(account).app.bsky.feed.getSuggestedFeeds({ limit: FEED_DISCOVERY_COUNT })).data.feeds,
  });
}

export function useFeedSearch(query: string) {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyFeedSearch(account, query),
    queryFn: async () =>
      (await getAgent(account).app.bsky.unspecced.getPopularFeedGenerators({ query, limit: FEED_DISCOVERY_COUNT })).data.feeds,
    enabled: query.length > 0,
  });
}

export function useIsSavedFeed(uri: string) {
  const { data } = useSavedFeeds();
  return data?.find((e) => e.saved.value === uri)?.saved;
}

export function useUpdateSavedFeed(uri: string) {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return useMutation({
    meta: handlesError,
    mutationFn: (action: SavedFeedAction) => bskyUpdateSavedFeed(getAgent(account), uri, action),
    onSuccess: (savedFeeds) => {
      queryClient.setQueryData(keys.bskyPreferences(account), (old: Awaited<ReturnType<Agent['getPreferences']>> | undefined) =>
        old && { ...old, savedFeeds },
      );
      return queryClient.invalidateQueries({ queryKey: keys.bskyFeeds(account) });
    },
  });
}
