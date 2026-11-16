import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';

import { useAccountScope } from '@/auth/session';
import { toAuthor } from '@/model/adapters/ap';
import type { Relationship } from '@/model/post';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { usePagedList } from '../paged-list';
import { handlesError } from '../mutation-meta';
import { PAGE_SIZE } from '../pagination';
import { isUnsupported } from './unsupported';

const EXTRAS_LIMIT = 20;

async function orEmpty<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    if (isUnsupported(error)) return [];
    throw error;
  }
}

export function useFollowRequests() {
  const { followRequests } = useCapabilities();
  const account = useAccountScope();
  return usePagedList(
    keys.accountList(account, 'follow-requests'),
    () => getMasto(account).v1.followRequests.list({ limit: PAGE_SIZE }),
    toAuthor,
    followRequests,
  );
}

export function useFollowRequestCount() {
  const { followRequests } = useCapabilities();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.credentials(account),
    queryFn: () => getMasto(account).v1.accounts.verifyCredentials(),
    enabled: followRequests,
    select: (account) => account.source.followRequestsCount ?? 0,
  }).data;
}

export function useFeaturedTags(id: string, enabled: boolean) {
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.accountExtras(scope, 'featured-tags', id),
    queryFn: () => orEmpty(async () => await getMasto(scope).v1.accounts.$select(id).featuredTags.list()),
    enabled,
  });
}

export function useEndorsedAccounts(id: string, enabled: boolean) {
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.accountExtras(scope, 'endorsements', id),
    queryFn: () =>
      orEmpty(async () => (await getMasto(scope).v1.accounts.$select(id).endorsements.list({ limit: EXTRAS_LIMIT })).map(toAuthor)),
    enabled,
  });
}

export function useFamiliarFollowers(id: string, enabled: boolean) {
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.accountExtras(scope, 'familiar', id),
    queryFn: () =>
      orEmpty(async () => (await getMasto(scope).v1.accounts.familiarFollowers.fetch([id])).flatMap((f) => f.accounts.map(toAuthor))),
    enabled,
  });
}

export type FollowOptions = { reblogs: boolean; notify: boolean };

export function useFollowOptions(accountId: string) {
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  const key = keys.relationship(scope, accountId);
  return useMutation({
    meta: handlesError,
    mutationFn: (options: FollowOptions) => getMasto(scope).v1.accounts.$select(accountId).follow(options),
    onMutate: async ({ reblogs, notify }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Relationship>(key);
      if (previous) queryClient.setQueryData<Relationship>(key, { ...previous, showingReblogs: reblogs, notifying: notify });
      return { previous };
    },
    onError: (_error, _options, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (relationship) => queryClient.setQueryData(key, relationship),
  });
}

export function useEndorseAccount(accountId: string) {
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (endorse: boolean) => {
      const account = getMasto(scope).v1.accounts.$select(accountId);
      return endorse ? account.pin() : account.unpin();
    },
    onSuccess: (relationship: mastodon.v1.Relationship) => {
      queryClient.setQueryData(keys.relationship(scope, accountId), relationship);
      queryClient.invalidateQueries({ queryKey: keys.accountExtrasAll(scope) });
    },
  });
}
