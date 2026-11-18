import type { ParseKeys } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';
import { useCallback, useEffect, useRef } from 'react';

import { accountKey, useAccountScope, useActingKey, useAuthedSession, useSession } from '@/auth/session';
import { toPoll, toPost } from '@/model/adapters/ap';
import type { Media, Poll, Post } from '@/model/post';

import { useInvalidateScheduled } from './ap/compose';
import { useServerFeatures } from './ap/server';
import { backendForPost, getBackend, useBackend, useCapabilities } from './backend';
import type { PostDraft } from './backend/types';
import {
  applyAction,
  patchStatus,
  removeStatus,
  restoreSnapshot,
  snapshotStatusCaches,
  type StatusAction,
} from './cache';
import type { Masto } from './client';
import { getMasto, mastoForPost, stampAccount } from './clients';
import { keys } from './keys';
import { invalidateInfinite, refreshFirstPage } from './pagination';
import { handlesError, toastFailure } from './mutation-meta';

export type { StatusAction } from './cache';

const stampOne = (post: Post, account: string) => stampAccount([post], account)[0];

const ownerOf = (post: Post, actingKey: string) => post.accountKey ?? actingKey;

export function useCanWriteQuotes() {
  const { quotes } = useCapabilities();
  const supported = useServerFeatures((features) => features.quotes).data;
  return quotes === 'always' || !!supported;
}

// The post a link points at, looked up through the account's server; null when the link is not a post.
export function useLinkedPost(url: string | undefined, account: string, self: string) {
  return useQuery({
    queryKey: keys.linkedPost(account, url ?? ''),
    queryFn: async ({ signal }) => {
      const backend = getBackend(account);
      const found = await backend.resolveUrl(url!, signal);
      return found?.type === 'status' ? stampOne(await backend.getPost(found.id), account) : null;
    },
    // Some servers answer a URL search with the post that contains the URL.
    select: (post) => (post?.id === self ? null : post),
    enabled: url !== undefined,
    staleTime: Infinity,
    retry: false,
  });
}

export function useStatus(id: string) {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.status(account, id),
    queryFn: async () => stampOne(await getBackend(account).getPost(id), account),
  });
}

export function useThread(id: string, enabled = true) {
  const account = useAccountScope();
  return useQuery({
    enabled,
    queryKey: keys.thread(account, id),
    queryFn: async () => {
      const { ancestors, descendants } = await getBackend(account).getThread(id);
      return { ancestors: stampAccount(ancestors, account), descendants: stampAccount(descendants, account) };
    },
  });
}

export function useSeedStatus() {
  const queryClient = useQueryClient();
  const acting = useActingKey();
  const { session } = useSession();
  const active = session ? accountKey(session) : null;
  return (status: Post) => {
    const owner = status.accountKey ?? acting ?? active;
    if (owner) queryClient.setQueryData(keys.status(owner, status.id), status);
  };
}

export function useStatusSource(id: string | undefined) {
  const { edit } = useCapabilities();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.statusSource(account, id),
    queryFn: () => getMasto(account).v1.statuses.$select(id!).source.fetch(),
    enabled: edit && !!id,
    gcTime: 0,
  });
}

export function useStatusHistory(id: string) {
  const { edit } = useCapabilities();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.statusHistory(account, id),
    enabled: edit,
    queryFn: async () => {
      const revisions = [];
      for await (const page of getMasto(account).v1.statuses.$select(id).history.list()) revisions.push(...page);
      return revisions;
    },
  });
}

type ActionVariables = { status: Post; action: StatusAction; active: boolean };

export function useStatusAction() {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ status, action, active: on }: ActionVariables): Promise<(current: Post) => Post> =>
      backendForPost(status, activeKey).postAction(status, action, on),
    onMutate: async ({ status, action, active: on }) => {
      const snapshot = await snapshotStatusCaches(queryClient);
      patchStatus(queryClient, ownerOf(status, activeKey), status.id, (s) => applyAction(s, action, on));
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      if (context) restoreSnapshot(queryClient, context.snapshot);
    },
    onSuccess: (update, { status, action }) => {
      const owner = ownerOf(status, activeKey);
      patchStatus(queryClient, owner, status.id, update);
      if (action === 'bookmark') queryClient.invalidateQueries({ queryKey: keys.saved(owner, 'bookmarks') });
    },
  });

  const { mutate: run } = mutation;
  const mutate = useCallback(
    ({ status, action }: { status: Post; action: StatusAction }) =>
      run({ status, action, active: backendForPost(status, activeKey).reserveAction(status, action) }),
    [run, activeKey],
  );
  return { mutate };
}

function usePollMutation<TVariables extends { statusId: string; account?: string }>(
  request: (masto: Masto, variables: TVariables) => Promise<mastodon.v1.Poll>,
  failedKey: ParseKeys,
) {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (variables: TVariables) => request(getMasto(variables.account ?? activeKey), variables),
    onError: (error) => toastFailure(failedKey, error),
    onSuccess: (poll, { statusId, account }) =>
      patchStatus(queryClient, account ?? activeKey, statusId, (s) => ({ ...s, poll: toPoll(poll) })),
  });
}

export const useVotePoll = () =>
  usePollMutation(
    (masto, { poll, choices }: { statusId: string; account?: string; poll: Poll; choices: number[] }) =>
      masto.v1.polls.$select(poll.id).votes.create({ choices }),
    'status.poll.voteFailed',
  );

export const useRefreshPoll = () =>
  usePollMutation((masto, { poll }: { statusId: string; account?: string; poll: Poll }) =>
    masto.v1.polls.$select(poll.id).fetch(),
    'status.poll.refreshFailed',
  );

const BSKY_INDEX_DELAY_MS = 1000;

export type Draft = PostDraft;

export function usePostStatus() {
  const backend = useBackend();
  const account = useAccountScope();
  const queryClient = useQueryClient();
  const abort = useRef<AbortController | null>(null);
  const invalidateScheduled = useInvalidateScheduled();

  useEffect(() => () => abort.current?.abort(), []);

  return useMutation({
    meta: handlesError,
    mutationFn: (draft: Draft) => {
      abort.current = new AbortController();
      return backend.post(draft, abort.current.signal);
    },
    onSuccess: (outcome, { parent }) => {
      switch (outcome.kind) {
        case 'indexing':
          setTimeout(() => {
            refreshFirstPage(queryClient, keys.timeline(account, 'home'));
            invalidateInfinite(queryClient, keys.timelines(account));
            queryClient.invalidateQueries({ queryKey: keys.accountStatusesAll(account) });
            if (parent) queryClient.invalidateQueries({ queryKey: keys.threads(account) });
          }, BSKY_INDEX_DELAY_MS);
          return;
        case 'scheduled':
          return invalidateScheduled();
        case 'edited':
          return patchStatus(queryClient, account, outcome.post.id, () => outcome.post);
        case 'created':
          invalidateInfinite(queryClient, keys.timelines(account));
          if (outcome.reply) queryClient.invalidateQueries({ queryKey: keys.threads(account) });
      }
    },
  });
}

export function useDeleteStatus() {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (status: Post) => backendForPost(status, activeKey).deletePost(status),
    onSuccess: (_, status) => removeStatus(queryClient, ownerOf(status, activeKey), status.id),
  });
}

type Redraft = { text: string; warning: string; visibility: mastodon.v1.StatusVisibility; replyTo?: string; media: Media[] };

const redrafts = new Map<string, Redraft>();
export const takeRedraft = (id: string) => redrafts.get(id);

// A delete returns the post's source text.
export function useRedraftStatus() {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: async (status: Post) => {
      const deleted = await mastoForPost(status, activeKey).v1.statuses.$select(status.id).remove();
      redrafts.set(status.id, {
        text: deleted.text ?? '',
        warning: deleted.spoilerText,
        visibility: deleted.visibility,
        replyTo: deleted.inReplyToId ?? undefined,
        media: status.media,
      });
    },
    onSuccess: (_, status) => removeStatus(queryClient, ownerOf(status, activeKey), status.id),
  });
}

type StatusToggle = 'pin' | 'mute';

export function useStatusToggle() {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: async ({ status, toggle }: { status: Post; toggle: StatusToggle }) => {
      if (toggle === 'pin') {
        await backendForPost(status, activeKey).setPinned(status, !status.viewer.pinned);
        return null;
      }
      const s = mastoForPost(status, activeKey).v1.statuses.$select(status.id);
      return status.viewer.muted ? s.unmute() : s.mute();
    },
    onSuccess: (updated, { status }) => {
      const owner = ownerOf(status, activeKey);
      if (updated) return patchStatus(queryClient, owner, status.id, () => toPost(updated));
      patchStatus(queryClient, owner, status.id, (s) => ({ ...s, viewer: { ...s.viewer, pinned: !status.viewer.pinned } }));
      return queryClient.invalidateQueries({ queryKey: keys.accountStatusesAll(owner) });
    },
  });
}
