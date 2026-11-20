import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { accountKey } from '@/auth/account-key';
import type { Session } from '@/auth/types';
import { useAccountScope, useApSession, useAuthedSession } from '@/auth/session';
import { toAuthor, toPostingDefaults } from '@/model/adapters/ap';
import type { Author, Post, Relationship } from '@/model/post';

import { getBackend, useBackend, useCapabilities } from './backend';
import type { InteractionKind, MuteOptions, ProfileEdit, ReportInput } from './backend/types';
import { getMasto } from './clients';
import { keys } from './keys';
import { usePagedList } from './paged-list';
import { handlesError, toastFailure } from './mutation-meta';
import { byPage, invalidateFeeds, invalidateInfinite, selectItems } from './pagination';

const PAGE_SIZE = 40;

export function useFollowList(accountId: string, kind: 'followers' | 'following') {
  const account = useAccountScope();
  return usePagedList(keys.accountList(account, kind, accountId), () => getBackend(account).follows(accountId, kind));
}

export function useInteractionList(postId: string, kind: InteractionKind) {
  const account = useAccountScope();
  return usePagedList(keys.accountList(account, kind, postId), () => getBackend(account).interactions(postId, kind));
}

export function useMutedAccounts() {
  const { moderationLists } = useCapabilities();
  const account = useAccountScope();
  return usePagedList(keys.accountList(account, 'mutes'), () => getMasto(account).v1.mutes.list({ limit: PAGE_SIZE }), toAuthor, moderationLists);
}

export function useBlockedAccounts() {
  const { moderationLists } = useCapabilities();
  const account = useAccountScope();
  return usePagedList(keys.accountList(account, 'blocks'), () => getMasto(account).v1.blocks.list({ limit: PAGE_SIZE }), toAuthor, moderationLists);
}

export function useBlockedDomains() {
  const { domainBlocks } = useCapabilities();
  const account = useAccountScope();
  return usePagedList(keys.accountList(account, 'domain-blocks'), () => getMasto(account).v1.domainBlocks.list({ limit: PAGE_SIZE }), undefined, domainBlocks);
}

type ListKind = 'mutes' | 'blocks';

function applyRelationship(
  queryClient: QueryClient,
  accountId: string,
  relationship: Relationship,
  list: ListKind | undefined,
  scope: string,
) {
  queryClient.setQueryData(keys.relationship(scope, accountId), relationship);
  if (list) queryClient.invalidateQueries({ queryKey: keys.accountList(scope, list) });
  invalidateFeeds(queryClient, scope);
}

export function useUndoAccountModeration(kind: ListKind) {
  const backend = useBackend();
  const scope = useAccountScope();
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
  const scope = useAccountScope();
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
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (action: AccountModeration) => backend.setRelationship(accountId, action),
    onSuccess: (relationship, action) =>
      applyRelationship(queryClient, accountId, relationship, action.endsWith('mute') ? 'mutes' : 'blocks', scope),
  });
}

export function useBlockDomain() {
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (domain: string) => getMasto(scope).v1.domainBlocks.create({ domain }),
    onSuccess: () => invalidateFeeds(queryClient, scope),
  });
}

export function useReport() {
  const backend = useBackend();
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (params: Omit<ReportInput, 'post'>) => {
      const [statusId] = params.statusIds ?? [];
      const post = statusId ? queryClient.getQueryData<Post>(keys.status(scope, statusId)) : undefined;
      return backend.report({ ...params, post });
    },
    onError: (error) => toastFailure('profile.report.failed', error),
  });
}

export function useAccount(id: string) {
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.account(scope, id),
    queryFn: () => getBackend(scope).profile(id),
  });
}

export function useSessionProfile(session: Session) {
  const key = accountKey(session);
  return useQuery({
    queryKey: keys.account(key, session.accountId),
    queryFn: () => getBackend(key).profile(session.accountId),
    staleTime: 60 * 60 * 1000,
  });
}

export function useRelationship(id: string, enabled = true) {
  const scope = useAccountScope();
  return useQuery({
    enabled,
    queryKey: keys.relationship(scope, id),
    queryFn: () => getBackend(scope).relationship(id),
  });
}

export function useToggleFollow(id: string) {
  const backend = useBackend();
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) => backend.setRelationship(id, follow ? 'follow' : 'unfollow'),
    onSuccess: (relationship) => {
      queryClient.setQueryData(keys.relationship(scope, id), relationship);
      queryClient.invalidateQueries({ queryKey: keys.account(scope, id) });
    },
  });
}

export function useFollowRequest(accountId: string) {
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  const listKey = keys.accountList(scope, 'follow-requests');
  return useMutation({
    meta: handlesError,
    mutationFn: (accept: boolean) => {
      const request = getMasto(scope).v1.followRequests.$select(accountId);
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
      queryClient.setQueryData(keys.relationship(scope, accountId), relationship);
      queryClient.invalidateQueries({ queryKey: keys.accounts(scope) });
      queryClient.invalidateQueries({ queryKey: keys.credentials(scope) });
    },
  });
}

export function useSetAccountNote(accountId: string) {
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (comment: string) => getMasto(scope).v1.accounts.$select(accountId).note.create({ comment }),
    onError: (error) => toastFailure('profile.note.failed', error),
    onSuccess: (relationship) => queryClient.setQueryData(keys.relationship(scope, accountId), relationship),
  });
}

export function useUnblockDomain() {
  const scope = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (domain: string) => getMasto(scope).v1.domainBlocks.remove({ domain }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.accountList(scope, 'domain-blocks') });
      invalidateInfinite(queryClient, keys.timelines(scope));
    },
  });
}

export function useCredentialAccount() {
  const { editProfile } = useCapabilities();
  const backend = useBackend();
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.editableProfile(scope),
    queryFn: () => backend.editableProfile(),
    enabled: editProfile,
    staleTime: 0,
  });
}

export function usePostingDefaults() {
  const { editProfile } = useCapabilities();
  const ap = !!useApSession();
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.credentials(scope),
    queryFn: () => getMasto(scope).v1.accounts.verifyCredentials(),
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
      const scope = accountKey(session);
      queryClient.invalidateQueries({ queryKey: keys.account(scope, session.accountId) });
      queryClient.invalidateQueries({ queryKey: keys.credentials(scope) });
      queryClient.invalidateQueries({ queryKey: keys.editableProfile(scope) });
    },
  });
}

export type ProfileTab = 'posts' | 'replies' | 'media';

export function useProfileStatuses(id: string, tab: ProfileTab, hidden: ReadonlySet<string>, hideBoosts = false) {
  const scope = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.accountStatuses(scope, id, tab),
    queryFn: ({ pageParam }) => getBackend(scope).profilePosts(id, tab, pageParam),
    ...byPage,
    select: (data) => {
      const listed = selectItems(data);
      if (hidden.size === 0 && !hideBoosts) return listed;
      return { ...listed, pages: listed.pages.map((page) => page.filter((s) => !hidden.has(s.id) && !(hideBoosts && s.repostedBy))) };
    },
  });
}

// One page: pins are capped by the server, and the cache patches expect infinite data.
export function useAccountPinned(id: string, enabled: boolean) {
  const { pinnedPosts } = useCapabilities();
  const scope = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.accountStatuses(scope, id, 'pinned'),
    queryFn: () => getBackend(scope).profilePosts(id, 'pinned'),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    select: selectItems,
    enabled: enabled && pinnedPosts,
  });
}
