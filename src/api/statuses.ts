import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';
import { useCallback, useEffect, useRef } from 'react';

import { accountKey, useActingKey, useAuthedSession, useForeignAccount, useSession } from '@/auth/session';
import { toPoll, toPost } from '@/model/adapters/ap';
import type { Poll, Post } from '@/model/post';

import { useInvalidateScheduled } from './ap/compose';
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
import { handlesError } from './mutation-meta';

export type { StatusAction } from './cache';

const stampMany = (posts: Post[], account: string | undefined) => (account ? stampAccount(posts, account) : posts);

const stampOne = (post: Post, account: string | undefined) => stampMany([post], account)[0];

export function useStatus(id: string) {
  const account = useForeignAccount();
  return useQuery({
    queryKey: keys.status(id, account),
    queryFn: async () => stampOne(await getBackend(account).getPost(id), account),
  });
}

export function useThread(id: string) {
  const account = useForeignAccount();
  return useQuery({
    queryKey: keys.thread(id, account),
    queryFn: async () => {
      const { ancestors, descendants } = await getBackend(account).getThread(id);
      return { ancestors: stampMany(ancestors, account), descendants: stampMany(descendants, account) };
    },
  });
}

export function useSeedStatus() {
  const queryClient = useQueryClient();
  const acting = useActingKey();
  const { session } = useSession();
  const active = session ? accountKey(session) : null;
  return (status: Post) => {
    const owner = status.accountKey ?? acting;
    queryClient.setQueryData(keys.status(status.id, owner && owner !== active ? owner : undefined), status);
  };
}

export function useStatusSource(id: string | undefined) {
  const { edit } = useCapabilities();
  const account = useForeignAccount();
  return useQuery({
    queryKey: keys.statusSource(id, account),
    queryFn: () => getMasto(account).v1.statuses.$select(id!).source.fetch(),
    enabled: edit && !!id,
    gcTime: 0,
  });
}

export function useStatusHistory(id: string) {
  const { edit } = useCapabilities();
  const account = useForeignAccount();
  return useQuery({
    queryKey: keys.statusHistory(id, account),
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
      patchStatus(queryClient, status.id, (s) => applyAction(s, action, on));
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      if (context) restoreSnapshot(queryClient, context.snapshot);
    },
    onSuccess: (update, { status }) => patchStatus(queryClient, status.id, update),
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
) {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (variables: TVariables) => request(getMasto(variables.account ?? activeKey), variables),
    onSuccess: (poll, { statusId }) =>
      patchStatus(queryClient, statusId, (s) => ({ ...s, poll: toPoll(poll) })),
  });
}

export const useVotePoll = () =>
  usePollMutation(
    (masto, { poll, choices }: { statusId: string; account?: string; poll: Poll; choices: number[] }) =>
      masto.v1.polls.$select(poll.id).votes.create({ choices }),
  );

export const useRefreshPoll = () =>
  usePollMutation((masto, { poll }: { statusId: string; account?: string; poll: Poll }) =>
    masto.v1.polls.$select(poll.id).fetch(),
  );

const BSKY_INDEX_DELAY_MS = 1000;

export type Draft = PostDraft;

export function usePostStatus() {
  const backend = useBackend();
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
            refreshFirstPage(queryClient, keys.timeline('home'));
            invalidateInfinite(queryClient, keys.timelines);
            queryClient.invalidateQueries({ queryKey: keys.accountStatusesAll });
            if (parent) queryClient.invalidateQueries({ queryKey: keys.threads });
          }, BSKY_INDEX_DELAY_MS);
          return;
        case 'scheduled':
          return invalidateScheduled();
        case 'edited':
          return patchStatus(queryClient, outcome.post.id, () => outcome.post);
        case 'created':
          invalidateInfinite(queryClient, keys.timelines);
          if (outcome.reply) queryClient.invalidateQueries({ queryKey: keys.threads });
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
    onSuccess: (_, status) => removeStatus(queryClient, status.id),
  });
}

type StatusToggle = 'pin' | 'mute';

export function useStatusToggle() {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: ({ status, toggle }: { status: Post; toggle: StatusToggle }) => {
      const s = mastoForPost(status, activeKey).v1.statuses.$select(status.id);
      if (toggle === 'pin') return status.viewer.pinned ? s.unpin() : s.pin();
      return status.viewer.muted ? s.unmute() : s.mute();
    },
    onSuccess: (updated, { status }) => patchStatus(queryClient, status.id, () => toPost(updated)),
  });
}
