import type { AppBskyActorDefs } from '@atproto/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { accountKey, useAuthedSession } from '@/auth/session';
import { useBsky } from '../client';
import { keys } from '../keys';
import { bskyPreferencesQuery } from './moderation';

export type MutedWordDraft = Pick<AppBskyActorDefs.MutedWord, 'value' | 'targets' | 'actorTarget' | 'expiresAt'>;

export function useMutedWords() {
  const agent = useBsky();
  const key = accountKey(useAuthedSession());
  return useQuery({ ...bskyPreferencesQuery(agent, key), select: (prefs) => prefs.moderationPrefs.mutedWords });
}

function useRefreshAfterChange() {
  const queryClient = useQueryClient();
  const key = accountKey(useAuthedSession());
  return async () => {
    await queryClient.invalidateQueries({ queryKey: keys.bskyPreferences(key) });
    await queryClient.invalidateQueries({ queryKey: keys.bskyModeration(key) });
  };
}

export function useAddMutedWord() {
  const agent = useBsky();
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: (word: MutedWordDraft) => agent.addMutedWord(word), onSuccess: refresh });
}

export function useRemoveMutedWord() {
  const agent = useBsky();
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: (word: AppBskyActorDefs.MutedWord) => agent.removeMutedWord(word), onSuccess: refresh });
}
