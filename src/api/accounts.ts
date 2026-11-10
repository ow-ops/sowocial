import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useApSession, useAuthedSession, useForeignAccount } from '@/auth/session';
import { toAuthor, toPostingDefaults } from '@/model/adapters/ap';
import type { Author, Post, Relationship } from '@/model/post';

import { getBackend, useBackend, useCapabilities } from './backend';
import type { MuteOptions, ProfileEdit, ReportInput } from './backend/types';
import { getMasto } from './clients';
import { keys } from './keys';
import { usePagedList } from './paged-list';
import { handlesError, toastFailure } from './mutation-meta';
import { invalidateFeeds, invalidateInfinite, pagingFor } from './pagination';

const PAGE_SIZE = 40;

export function useFollowList(accountId: string, kind: 'followers' | 'following') {
  const account = useForeignAccount();
  return usePagedList(keys.accountList(kind, accountId), () => getBackend(account).follows(accountId, kind));
}

export function useMutedAccounts() {
  const { moderationLists } = useCapabilities();
  return usePagedList(keys.accountList('mutes'), () => getMasto().v1.mutes.list({ limit: PAGE_SIZE }), toAuthor, moderationLists);
}

export function useBlockedAccounts() {
  const { moderationLists } = useCapabilities();
  return usePagedList(keys.accountList('blocks'), () => getMasto().v1.blocks.list({ limit: PAGE_SIZE }), toAuthor, moderationLists);
}

export function useBlockedDomains() {
  const { domainBlocks } = useCapabilities();
  return usePagedList(keys.accountList('domain-blocks'), () => getMasto().v1.domainBlocks.list({ limit: PAGE_SIZE }), undefined, domainBlocks);
}

type ListKind = 'mutes' | 'blocks';

function applyRelationship(
  queryClient: QueryClient,
  accountId: string,
  relationship: Relationship,
  list: ListKind | undefined,
  scope: string | undefined,
) {
  queryClient.setQueryData(keys.relationship(accountId, scope), relationship);
  if (list) queryClient.invalidateQueries({ queryKey: keys.accountList(list) });
  invalidateFeeds(queryClient);
}

export function useUndoAccountModeration(kind: ListKind) {
  const backend = useBackend();
  const scope = useForeignAccount();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (id: string) => backend.setRelationship(id, kind === 'mutes' ? 'unmute' : 'unblock'),
    onSuccess: (relationship, id) => applyRelationship(queryClient, id, relationship, kind, scope),
  });
}

// GoToSocial's mute defaults to posts only, so notifications is always sent. `duration` is seconds; 0 never expires.
export function useMuteAccount(accountId: string) {
  const backend = useBackend();
  const scope = useForeignAccount();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (params: MuteOptions) => backend.setRelationship(accountId, 'mute', params),
    onError: (error) => toastFailure('profile.mute.failed', error),
    onSuccess: (relationship) => applyRelationship(queryClient, accountId, relationship, 'mutes', scope),
  });
}

type AccountModeration = 'mute' | 'unmute' | 'block' | 'unblock';

export function useAccountModeration(accountId: string) {
  const backend = useBackend();
  const scope = useForeignAccount();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (action: AccountModeration) => backend.setRelationship(accountId, action),
    onSuccess: (relationship, action) =>
      applyRelationship(queryClient, accountId, relationship, action.endsWith('mute') ? 'mutes' : 'blocks', scope),
  });
}

export function useBlockDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (domain: string) => getMasto().v1.domainBlocks.create({ domain }),
    onSuccess: () => invalidateFeeds(queryClient),
  });
}

export function useReport() {
  const backend = useBackend();
  const scope = useForeignAccount();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (params: Omit<ReportInput, 'post'>) => {
      const [statusId] = params.statusIds ?? [];
      const post = statusId ? queryClient.getQueryData<Post>(keys.status(statusId, scope)) : undefined;
      return backend.report({ ...params, post });
    },
    onError: (error) => toastFailure('profile.report.failed', error),
  });
}

export function useAccount(id: string) {
  const scope = useForeignAccount();
  return useQuery({
    queryKey: keys.account(id, scope),
    queryFn: () => getBackend(scope).profile(id),
  });
}

export function useRelationship(id: string) {
  const scope = useForeignAccount();
  return useQuery({
    queryKey: keys.relationship(id, scope),
    queryFn: () => getBackend(scope).relationship(id),
  });
}

export function useToggleFollow(id: string) {
  const backend = useBackend();
  const scope = useForeignAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) => backend.setRelationship(id, follow ? 'follow' : 'unfollow'),
    onSuccess: (relationship) => {
      queryClient.setQueryData(keys.relationship(id, scope), relationship);
      queryClient.invalidateQueries({ queryKey: keys.account(id, scope) });
    },
  });
}

export function useFollowRequest(accountId: string) {
  const scope = useForeignAccount();
  const queryClient = useQueryClient();
  const listKey = keys.accountList('follow-requests');
  return useMutation({
    meta: handlesError,
    mutationFn: (accept: boolean) => {
      const request = getMasto().v1.followRequests.$select(accountId);
      return accept ? request.authorize() : request.reject();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<InfiniteData<Author[]>>(listKey);
      queryClient.setQueryData<InfiniteData<Author[]>>(
        listKey,
        (old) => old && { ...old, pages: old.pages.map((page) => page.filter((a) => a.id !== accountId)) },
      );
      return { previous };
    },
    onError: (error, accept, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      toastFailure(accept ? 'profile.followRequests.acceptFailed' : 'profile.followRequests.rejectFailed', error);
    },
    onSuccess: (relationship) => {
      queryClient.setQueryData(keys.relationship(accountId, scope), relationship);
      queryClient.invalidateQueries({ queryKey: keys.accounts });
      queryClient.invalidateQueries({ queryKey: keys.credentials });
    },
  });
}

export function useSetAccountNote(accountId: string) {
  const scope = useForeignAccount();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (comment: string) => getMasto().v1.accounts.$select(accountId).note.create({ comment }),
    onError: (error) => toastFailure('profile.note.failed', error),
    onSuccess: (relationship) => queryClient.setQueryData(keys.relationship(accountId, scope), relationship),
  });
}

export function useUnblockDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (domain: string) => getMasto().v1.domainBlocks.remove({ domain }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.accountList('domain-blocks') });
      invalidateInfinite(queryClient, keys.timelines);
    },
  });
}

export function useCredentialAccount() {
  const { editProfile } = useCapabilities();
  const backend = useBackend();
  return useQuery({
    queryKey: keys.editableProfile,
    queryFn: () => backend.editableProfile(),
    enabled: editProfile,
    staleTime: 0,
  });
}

export function usePostingDefaults() {
  const { editProfile } = useCapabilities();
  const ap = !!useApSession();
  return useQuery({
    queryKey: keys.credentials,
    queryFn: () => getMasto().v1.accounts.verifyCredentials(),
    enabled: editProfile && ap,
    select: toPostingDefaults,
  }).data;
}

export function useUpdateProfile() {
  const backend = useBackend();
  const session = useAuthedSession();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (edit: ProfileEdit) => backend.updateProfile(edit),
    onError: (error) => toastFailure('profile.editProfile.saveFailed', error),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.account(session.accountId) });
      queryClient.invalidateQueries({ queryKey: keys.credentials });
      queryClient.invalidateQueries({ queryKey: keys.editableProfile });
    },
  });
}

export type ProfileTab = 'posts' | 'replies' | 'media';

export function useProfileStatuses(id: string, tab: ProfileTab, hidden: ReadonlySet<string>) {
  const { paging } = useCapabilities();
  const scope = useForeignAccount();
  return useInfiniteQuery({
    queryKey: keys.accountStatuses(id, tab, scope),
    queryFn: ({ pageParam }) => getBackend(scope).profilePosts(id, tab, pageParam),
    ...pagingFor(paging),
    select: (data: InfiniteData<Post[]>) =>
      hidden.size === 0 ? data : { ...data, pages: data.pages.map((page) => page.filter((s) => !hidden.has(s.id))) },
  });
}

// One page: pins are capped by the server, and the cache patches expect infinite data.
export function useAccountPinned(id: string, enabled: boolean) {
  const { pinnedPosts } = useCapabilities();
  const scope = useForeignAccount();
  return useInfiniteQuery({
    queryKey: keys.accountStatuses(id, 'pinned', scope),
    queryFn: () => getBackend(scope).profilePosts(id, 'pinned'),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    enabled: enabled && pinnedPosts,
  });
}
