import type { Agent, ModerationOpts } from '@atproto/api';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { accountKey, findSession, useAuthedSession } from '@/auth/session';
import { moderatedPost, profileModeration, type ModerationContext } from '@/model/moderation';
import type { Author, Post } from '@/model/post';

import { capabilitiesFor } from '../backend/capabilities';
import { getAgent } from '../clients';
import { keys } from '../keys';

const SESSION_STALE = 30 * 60 * 1000;

export const bskyPreferencesQuery = (agent: Agent, key: string) => ({
  queryKey: keys.bskyPreferences(key),
  queryFn: () => agent.getPreferences(),
  staleTime: SESSION_STALE,
});

export async function loadModerationOpts(queryClient: QueryClient, agent: Agent, key: string): Promise<ModerationOpts> {
  const { moderationPrefs } = await queryClient.fetchQuery(bskyPreferencesQuery(agent, key));
  agent.configureLabelers(moderationPrefs.labelers.map((labeler) => labeler.did));
  const labelDefs = await agent.getLabelDefinitions(moderationPrefs);
  return { userDid: agent.assertDid, prefs: moderationPrefs, labelDefs };
}

export function useModerationOpts(forKey?: string, enabled = true) {
  const session = useAuthedSession();
  const key = forKey ?? accountKey(session);
  const target = findSession(key);
  return useQuery({
    queryKey: keys.bskyModeration(key),
    queryFn: ({ client }) => loadModerationOpts(client, getAgent(key), key),
    enabled: enabled && !!target && capabilitiesFor(target.protocol).labels,
    staleTime: SESSION_STALE,
  }).data;
}

export function useModeratedPost(post: Post, context?: ModerationContext) {
  return moderatedPost(post, useModerationOpts(post.accountKey, post.protocol === 'bsky'), context);
}

export function useProfileModeration(author?: Author) {
  const opts = useModerationOpts(undefined, author?.protocol === 'bsky');
  return author ? profileModeration(author, opts) : { labels: [] as string[], blurAvatar: false };
}
