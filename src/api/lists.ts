import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useBackend, useCapabilities } from './backend';
import type { ListSettings } from './backend/types';
import { keys } from './keys';
import { pagingFor, invalidateInfinite } from './pagination';
import { handlesError } from './mutation-meta';

export type { ListSettings } from './backend/types';

export function useLists() {
  const { lists } = useCapabilities();
  const backend = useBackend();
  return useQuery({ queryKey: keys.lists, queryFn: () => backend.lists(), enabled: lists });
}

export function useList(id: string) {
  const { lists } = useCapabilities();
  const backend = useBackend();
  return useQuery({ queryKey: keys.list(id), queryFn: () => backend.list(id), enabled: lists });
}

export function useListTimeline(id: string) {
  const { lists, paging } = useCapabilities();
  const backend = useBackend();
  return useInfiniteQuery({
    queryKey: keys.listTimeline(id),
    queryFn: ({ pageParam }) => backend.listTimelinePage(id, pageParam),
    ...pagingFor(paging),
    enabled: lists,
  });
}

export function useListMembers(id: string) {
  const { lists } = useCapabilities();
  const backend = useBackend();
  return useQuery({ queryKey: keys.listMembers(id), queryFn: () => backend.listMembers(id), enabled: lists });
}

export function useCreateList() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (settings: ListSettings) => backend.createList(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.lists }),
  });
}

export function useUpdateList(id: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (settings: ListSettings) => backend.updateList(id, settings),
    onSuccess: (list) => {
      queryClient.setQueryData(keys.list(id), list);
      return queryClient.invalidateQueries({ queryKey: keys.lists });
    },
  });
}

export function useDeleteList() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (id: string) => backend.deleteList(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.list(id) });
      queryClient.removeQueries({ queryKey: keys.listTimeline(id) });
      return queryClient.invalidateQueries({ queryKey: keys.lists });
    },
  });
}

export function useListMembership(listId: string) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: ({ accountId, member }: { accountId: string; member: boolean }) => backend.setListMember(listId, accountId, member),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.listMembers(listId) });
      invalidateInfinite(queryClient, keys.listTimeline(listId));
    },
  });
}

export function useListCandidates(q: string) {
  const { lists } = useCapabilities();
  const backend = useBackend();
  return useQuery({
    queryKey: keys.followingSearch(q),
    queryFn: () => backend.listCandidates(q),
    enabled: lists && q.length > 0,
    staleTime: 60_000,
  });
}
