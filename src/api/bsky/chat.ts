import type { Agent, ChatBskyConvoDefs } from '@atproto/api';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { resolveServices, splitService } from '@/auth/bsky-services';
import { getBskyAgent } from '@/auth/bsky-loader';
import { useAppActive } from '@/hooks/use-app-active';
import { toConvo, toMessage } from '@/model/adapters/bsky-chat';
import type { ChatConvo, ChatMessage } from '@/model/chat';

import { chatErrorMessage } from './chat-error';
import { useCapabilities } from '../backend';
import { getBskySession } from '../clients';
import { keys } from '../keys';
import { byCursor } from '../pagination';
import { handlesError, toastFailure } from '../mutation-meta';

const CONVO_PAGE = 30;
const MESSAGE_PAGE = 50;
const CONVO_POLL_MS = 20_000;
const MESSAGE_POLL_MS = 6_000;
const UNREAD_POLL_MS = 60_000;

const proxied = new WeakMap<Agent, { service: string; agent: Agent }>();

export function chatAgent(agent: Agent, service: string) {
  const cached = proxied.get(agent);
  if (cached?.service === service) return cached.agent;
  const { did, type } = splitService(service);
  const chat = agent.withProxy(type, did);
  proxied.set(agent, { service, agent: chat });
  return chat;
}

async function call<T>(request: () => Promise<T>) {
  try {
    return await request();
  } catch (error) {
    throw new Error(chatErrorMessage(error), { cause: error });
  }
}

function useLive() {
  const focused = useIsFocused();
  const active = useAppActive();
  return focused && active;
}

function chatContext() {
  const session = getBskySession();
  return { agent: chatAgent(getBskyAgent(session), resolveServices(session).chat), did: session.accountId };
}

function useChatEnabled() {
  return useCapabilities().chat;
}

export function useBskyConvos() {
  const enabled = useChatEnabled();
  const live = useLive();
  return useInfiniteQuery({
    queryKey: keys.bskyConvos,
    queryFn: async ({ pageParam }): Promise<ChatConvo[]> => {
      const { agent, did } = chatContext();
      const { data } = await call(() =>
        agent.chat.bsky.convo.listConvos({ limit: CONVO_PAGE, cursor: pageParam, status: 'accepted' }),
      );
      return data.convos.map((c) => ({ ...toConvo(c, did), cursor: data.cursor }));
    },
    enabled,
    refetchInterval: live ? CONVO_POLL_MS : false,
    ...byCursor,
  });
}

export function useBskyMessages(convoId: string) {
  const enabled = useChatEnabled();
  const live = useLive();
  return useInfiniteQuery({
    queryKey: keys.bskyMessages(convoId),
    queryFn: async ({ pageParam }): Promise<ChatMessage[]> => {
      const { data } = await call(() =>
        chatContext().agent.chat.bsky.convo.getMessages({ convoId, limit: MESSAGE_PAGE, cursor: pageParam }),
      );
      return data.messages.flatMap((view) => {
        const message = toMessage(view);
        return message ? [{ ...message, cursor: data.cursor }] : [];
      });
    },
    enabled,
    refetchInterval: live ? MESSAGE_POLL_MS : false,
    ...byCursor,
  });
}

export function useBskyChatUnread() {
  const enabled = useChatEnabled();
  const appActive = useAppActive();
  return useQuery({
    queryKey: keys.bskyChatUnread,
    queryFn: async () => (await chatContext().agent.chat.bsky.convo.getUnreadCounts({})).data.unreadAcceptedConvos,
    enabled,
    retry: false,
    refetchInterval: appActive ? UNREAD_POLL_MS : false,
  });
}

function patchConvos(queryClient: QueryClient, update: (convo: ChatConvo) => ChatConvo) {
  queryClient.setQueriesData<InfiniteData<ChatConvo[]>>({ queryKey: keys.bskyConvos }, (data) => {
    if (!data) return data;
    return { ...data, pages: data.pages.map((page) => page.map(update)) };
  });
}

export function useSendBskyMessage(convoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: async (text: string) => {
      const { data } = await call(() => chatContext().agent.chat.bsky.convo.sendMessage({ convoId, message: { text } }));
      return toMessage(data) as ChatMessage;
    },
    onError: (error) => toastFailure('chat.sendFailed', error),
    onSuccess: (message) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(keys.bskyMessages(convoId), (data) => {
        if (!data) return data;
        const [first = [], ...rest] = data.pages;
        return { ...data, pages: [[message, ...first.filter((m) => m.id !== message.id)], ...rest] };
      });
      patchConvos(queryClient, (c) => (c.id === convoId ? { ...c, lastMessage: message } : c));
    },
  });
}

export function useMarkBskyConvoRead(convoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: async (messageId: string) => {
      const { data } = await call(() => chatContext().agent.chat.bsky.convo.updateRead({ convoId, messageId }));
      return data.convo as ChatBskyConvoDefs.ConvoView;
    },
    onSuccess: () => {
      patchConvos(queryClient, (c) => (c.id === convoId ? { ...c, unread: 0 } : c));
      queryClient.invalidateQueries({ queryKey: keys.bskyChatUnread });
    },
    onError: (error) => console.warn('Marking the conversation read failed', error),
  });
}
