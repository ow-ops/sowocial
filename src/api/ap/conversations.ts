import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';
import { useEffect } from 'react';

import { useAccountScope, useApSession } from '@/auth/session';
import { useAppActive } from '@/hooks/use-app-active';
import { toAuthor, toPost } from '@/model/adapters/ap';
import type { Author, Post } from '@/model/post';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { useInstance } from './instance';
import { keys } from '../keys';
import { usePagedList } from '../paged-list';
import { openStream } from './streaming';

export type Conversation = Omit<mastodon.v1.Conversation, 'accounts' | 'lastStatus'> & {
  accounts: Author[];
  lastStatus?: Post;
};
type Pages = InfiniteData<Conversation[]>;

const toConversation = (c: mastodon.v1.Conversation): Conversation => ({
  ...c,
  accounts: c.accounts.map(toAuthor),
  lastStatus: c.lastStatus ? toPost(c.lastStatus) : undefined,
});

export function useConversations() {
  const { conversations } = useCapabilities();
  const account = useAccountScope();
  return usePagedList(keys.conversations(account), () => getMasto(account).v1.conversations.list({ limit: 20 }), toConversation, conversations);
}

function patchConversations(queryClient: QueryClient, account: string, update: (pages: Conversation[][]) => Conversation[][]) {
  queryClient.setQueriesData<Pages>(
    { queryKey: keys.conversations(account) },
    (data) => data && { ...data, pages: update(data.pages) },
  );
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return useMutation({
    mutationFn: (id: string) => getMasto(account).v1.conversations.$select(id).read(),
    onSuccess: (conversation) =>
      patchConversations(queryClient, account, (pages) =>
        pages.map((p) => p.map((c) => (c.id === conversation.id ? { ...c, unread: false } : c))),
      ),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return useMutation({
    mutationFn: (id: string) => getMasto(account).v1.conversations.$select(id).remove(),
    onSuccess: (_, id) =>
      patchConversations(queryClient, account, (pages) => pages.map((p) => p.filter((c) => c.id !== id))),
  });
}

export function useConversationStream() {
  const token = useApSession()?.token;
  const account = useAccountScope();
  const { data: instance } = useInstance();
  const queryClient = useQueryClient();
  const active = useAppActive();
  const streamingApiUrl = instance?.configuration.urls.streaming;

  useEffect(() => {
    if (!streamingApiUrl || !token || !active) return;
    return openStream(
      streamingApiUrl,
      token,
      (client) => client.direct.subscribe(),
      (event) => {
        if (event.event === 'conversation') queryClient.invalidateQueries({ queryKey: keys.conversations(account) });
      },
    );
  }, [streamingApiUrl, token, active, account, queryClient]);
}
