import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ModListKind } from '../backend/types';
import { getAgent } from '../clients';
import { keys } from '../keys';
import { handlesError, toastFailure } from '../mutation-meta';
import { usePagedList } from '../paged-list';
import { bskyListMemberPages, bskyModList, bskyModListSubscriptions, bskySetModListSubscription, type ModList } from './lists';

export function useModListSubscriptions(kind: ModListKind) {
  return useQuery({
    queryKey: keys.modListSubscriptions(kind),
    queryFn: () => bskyModListSubscriptions(getAgent(), kind),
  });
}

const modListKey = (id: string) => [...keys.list(id), 'mod'] as const;

export function useModList(id: string) {
  return useQuery({ queryKey: modListKey(id), queryFn: () => bskyModList(getAgent(), id) });
}

export function useModListMembers(id: string) {
  return usePagedList([...keys.list(id), 'mod-members'], () => bskyListMemberPages(getAgent(), id));
}

export function useSetModListSubscription(listId: string, kind: ModListKind) {
  const queryClient = useQueryClient();
  const key = modListKey(listId);
  const field = kind === 'mute' ? 'muted' : 'blocked';
  return useMutation({
    meta: handlesError,
    mutationFn: (on: boolean) => bskySetModListSubscription(getAgent(), listId, kind, on),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.modLists }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
