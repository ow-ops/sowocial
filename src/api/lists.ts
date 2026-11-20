import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { useBackend, useCapabilities } from './backend';
import type { ListSettings } from './backend/types';
import { keys } from './keys';
import { byPage, invalidateInfinite, selectItems } from './pagination';
import { handlesError } from './mutation-meta';

export type { ListSettings } from './backend/types';

export function useLists() {
  const { lists } = useCapabilities();
  const backend = useBackend();
  const account = useAccountScope();
  return useQuery({ queryKey: keys.lists(account), queryFn: () => backend.lists(), enabled: lists });
}

export function useList(id: string) {
  const { lists } = useCapabilities();
  const backend = useBackend();
  const account = useAccountScope();
  return useQuery({ queryKey: keys.list(account, id), queryFn: () => backend.list(id), enabled: lists });
}

export function useListTimeline(id: string) {
  const { lists } = useCapabilities();
  const backend = useBackend();
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.listTimeline(account, id),
    queryFn: ({ pageParam }) => backend.listTimelinePage(id, pageParam),
    ...byPage,
    select: selectItems,
    enabled: lists,
  });
}

export function useListMembers(id: string) {
  const { lists } = useCapabilities();
  const backend = useBackend();
  const account = useAccountScope();
  return useQuery({ queryKey: keys.listMembers(account, id), queryFn: () => backend.listMembers(id), enabled: lists });
}

export function useCreateList() {
  const backend = useBackend();
  const account = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (settings: ListSettings) => backend.createList(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.lists(account) }),
  });
}

export function useUpdateList(id: string) {
  const backend = useBackend();
  const account = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (settings: ListSettings) => backend.updateList(id, settings),
    onSuccess: (list) => {
      queryClient.setQueryData(keys.list(account, id), list);
      return queryClient.invalidateQueries({ queryKey: keys.lists(account) });
    },
  });
}

export function useDeleteList() {
  const backend = useBackend();
  const account = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (id: string) => backend.deleteList(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.list(account, id) });
      queryClient.removeQueries({ queryKey: keys.listTimeline(account, id) });
      return queryClient.invalidateQueries({ queryKey: keys.lists(account) });
    },
  });
}

export function useListMembership(listId: string) {
  const backend = useBackend();
  const account = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: ({ accountId, member }: { accountId: string; member: boolean }) => backend.setListMember(listId, accountId, member),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.listMembers(account, listId) });
      invalidateInfinite(queryClient, keys.listTimeline(account, listId));
    },
  });
}

export function useListCandidates(q: string) {
  const { lists } = useCapabilities();
  const backend = useBackend();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.followingSearch(account, q),
    queryFn: () => backend.listCandidates(q),
    enabled: lists && q.length > 0,
    staleTime: 60_000,
  });
}
