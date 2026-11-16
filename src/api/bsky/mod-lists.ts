import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import type { ModListKind } from '../backend/types';
import { getAgent } from '../clients';
import { keys } from '../keys';
import { handlesError, toastFailure } from '../mutation-meta';
import { usePagedList } from '../paged-list';
import { bskyListMemberPages, bskyModList, bskyModListSubscriptions, bskySetModListSubscription, type ModList } from './lists';

export function useModListSubscriptions(kind: ModListKind) {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.modListSubscriptions(account, kind),
    queryFn: () => bskyModListSubscriptions(getAgent(account), kind),
  });
}

const modListKey = (account: string, id: string) => [...keys.list(account, id), 'mod'] as const;

export function useModList(id: string) {
  const account = useAccountScope();
  return useQuery({ queryKey: modListKey(account, id), queryFn: () => bskyModList(getAgent(account), id) });
}

export function useModListMembers(id: string) {
  const account = useAccountScope();
  return usePagedList([...keys.list(account, id), 'mod-members'], () => bskyListMemberPages(getAgent(account), id));
}

export function useSetModListSubscription(listId: string, kind: ModListKind) {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  const key = modListKey(account, listId);
  const field = kind === 'mute' ? 'muted' : 'blocked';
  return useMutation({
    meta: handlesError,
    mutationFn: (on: boolean) => bskySetModListSubscription(getAgent(account), listId, kind, on),
    onMutate: async (on) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ModList>(key)?.subscription[field];
      queryClient.setQueryData<ModList>(key, (old) => old && { ...old, subscription: { ...old.subscription, [field]: on } });
      return { previous };
    },
    onError: (error, _on, context) => {
      // Only this switch is rolled back; the other one may have its own request in flight.
      if (context?.previous !== undefined) {
        queryClient.setQueryData<ModList>(
          key,
          (old) => old && { ...old, subscription: { ...old.subscription, [field]: context.previous } },
        );
      }
      toastFailure('profile.lists.subscribeFailed', error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.modLists(account) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
