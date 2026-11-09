import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';

import { toAuthor, toPost } from '@/model/adapters/ap';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { byMaxId, invalidateInfinite, PAGE_SIZE } from '../pagination';
import { handlesError } from '../mutation-meta';

type List = mastodon.v1.List;

export type ListSettings = { title: string; repliesPolicy: mastodon.v1.ListRepliesPolicy; exclusive: boolean };

export function useLists() {
  const { lists } = useCapabilities();
  return useQuery({ queryKey: keys.lists, queryFn: async () => await getMasto().v1.lists.list(), enabled: lists });
}

export function useList(id: string) {
  const { lists } = useCapabilities();
  return useQuery({ queryKey: keys.list(id), queryFn: () => getMasto().v1.lists.$select(id).fetch(), enabled: lists });
}

export function useListTimeline(id: string) {
  const { lists } = useCapabilities();
  return useInfiniteQuery({
    queryKey: keys.listTimeline(id),
    queryFn: async ({ pageParam }) =>
      (await getMasto().v1.timelines.list.$select(id).list({ limit: PAGE_SIZE, maxId: pageParam })).map(toPost),
    ...byMaxId,
    enabled: lists,
  });
}

// Limit 0 asks GoToSocial for every member in one response.
export function useListMembers(id: string) {
  const { lists } = useCapabilities();
  return useQuery({
    queryKey: keys.listMembers(id),
    queryFn: async () => (await getMasto().v1.lists.$select(id).accounts.list({ limit: 0 })).map(toAuthor),
    enabled: lists,
  });
}

export function useCreateList() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    // masto's typings predate GoToSocial's replies policy, which it still serializes.
    mutationFn: (params: ListSettings) => getMasto().v1.lists.create(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.lists }),
  });
}

export function useUpdateList(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (params: ListSettings) => getMasto().v1.lists.$select(id).update(params),
    onSuccess: (list: List) => {
      queryClient.setQueryData(keys.list(id), list);
      return queryClient.invalidateQueries({ queryKey: keys.lists });
    },
  });
}

export function useDeleteList() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (id: string) => getMasto().v1.lists.$select(id).remove(),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.list(id) });
      queryClient.removeQueries({ queryKey: keys.listTimeline(id) });
      return queryClient.invalidateQueries({ queryKey: keys.lists });
    },
  });
}

export function useListMembership(listId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: ({ accountId, member }: { accountId: string; member: boolean }) => {
      const accounts = getMasto().v1.lists.$select(listId).accounts;
      return member ? accounts.create({ accountIds: [accountId] }) : accounts.remove({ accountIds: [accountId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.listMembers(listId) });
      invalidateInfinite(queryClient, keys.listTimeline(listId));
    },
  });
}

export function useFollowedAccountSearch(q: string) {
  const { lists } = useCapabilities();
  return useQuery({
    queryKey: keys.followingSearch(q),
    queryFn: async () => (await getMasto().v1.accounts.search.list({ q, following: true, limit: 10 })).map(toAuthor),
    enabled: lists && q.length > 0,
    staleTime: 60_000,
  });
}
