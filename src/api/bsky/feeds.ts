import type { Agent } from '@atproto/api';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBskyAgent } from '@/auth/bsky-loader';
import { accountKey, useAuthedSession } from '@/auth/session';
import { bskySavedFeeds, bskyUpdateSavedFeed, type SavedFeedAction } from './feed-data';
import { bskyPreferencesQuery } from './moderation';
import { useBsky } from '../client';
import { getAgent, getBskySession } from '../clients';
import { keys } from '../keys';
import { byCursor } from '../pagination';
import { handlesError } from '../mutation-meta';

function usePreferences() {
  const agent = useBsky();
  return bskyPreferencesQuery(agent, accountKey(useAuthedSession()));
}

export function useSavedFeeds() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.bskyFeeds,
    queryFn: async () => {
      const session = getBskySession();
      const agent = getBskyAgent(session);
      const preferences = await queryClient.fetchQuery(bskyPreferencesQuery(agent, accountKey(session)));
      return bskySavedFeeds(agent, preferences.savedFeeds);
    },
  });
}

export function useFeedTimeline(uri: string) {
  return useInfiniteQuery({
    queryKey: keys.feedTimeline(uri),
    queryFn: async ({ pageParam }) => (await import('./feed-page')).bskyFeedPage(getAgent(), uri, pageParam),
    ...byCursor,
  });
}

export function useFeedGenerator(uri: string) {
  const agent = useBsky();
  return useQuery({
    queryKey: keys.bskyFeed(uri),
    queryFn: async () => (await agent.app.bsky.feed.getFeedGenerator({ feed: uri })).data,
  });
}

export function useIsSavedFeed(uri: string) {
  const { data } = useSavedFeeds();
  return data?.find((e) => e.saved.value === uri)?.saved;
}

export function useUpdateSavedFeed(uri: string) {
  const agent = useBsky();
  const queryClient = useQueryClient();
  const preferences = usePreferences();
  return useMutation({
    meta: handlesError,
    mutationFn: (action: SavedFeedAction) => bskyUpdateSavedFeed(agent, uri, action),
    onSuccess: (savedFeeds) => {
      queryClient.setQueryData(preferences.queryKey, (old: Awaited<ReturnType<Agent['getPreferences']>> | undefined) =>
        old && { ...old, savedFeeds },
      );
      return queryClient.invalidateQueries({ queryKey: keys.bskyFeeds });
    },
  });
}
