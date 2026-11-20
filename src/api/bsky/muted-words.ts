import type { AppBskyActorDefs } from '@atproto/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';
import { getAgent } from '../clients';
import { keys } from '../keys';
import { bskyPreferencesQuery } from './moderation';

export type MutedWordDraft = Pick<AppBskyActorDefs.MutedWord, 'value' | 'targets' | 'actorTarget' | 'expiresAt'>;

export function useMutedWords() {
  return useQuery({ ...bskyPreferencesQuery(useAccountScope()), select: (prefs) => prefs.moderationPrefs.mutedWords });
}

function useRefreshAfterChange() {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: keys.bskyPreferences(account) });
    await queryClient.invalidateQueries({ queryKey: keys.bskyModeration(account) });
  };
}

export function useAddMutedWord() {
  const account = useAccountScope();
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: (word: MutedWordDraft) => getAgent(account).addMutedWord(word), onSuccess: refresh });
}

export function useRemoveMutedWord() {
  const account = useAccountScope();
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: (word: AppBskyActorDefs.MutedWord) => getAgent(account).removeMutedWord(word), onSuccess: refresh });
}
