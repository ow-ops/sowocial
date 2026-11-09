import type { ChatBskyActorDefs, ChatBskyConvoDefs } from '@atproto/api';

import type { ChatConvo, ChatMember, ChatMessage } from '../chat';

const GROUP = 'chat.bsky.convo.defs#groupConvo';

export const toMember = (profile: ChatBskyActorDefs.ProfileViewBasic): ChatMember => ({
  did: profile.did,
  handle: profile.handle,
  name: profile.displayName?.trim() || profile.handle,
  avatar: profile.avatar,
  chatDisabled: !!profile.chatDisabled,
});

export function toMessage(view: { $type?: string } | undefined): ChatMessage | undefined {
  if (!view) return undefined;
  if (view.$type === 'chat.bsky.convo.defs#messageView') {
    const m = view as ChatBskyConvoDefs.MessageView;
    return { id: m.id, sentAt: m.sentAt, senderDid: m.sender.did, text: m.text, deleted: false };
  }
  if (view.$type === 'chat.bsky.convo.defs#deletedMessageView') {
    const m = view as ChatBskyConvoDefs.DeletedMessageView;
    return { id: m.id, sentAt: m.sentAt, senderDid: m.sender.did, text: '', deleted: true };
  }
  return undefined;
}

export function toConvo(view: ChatBskyConvoDefs.ConvoView, myDid: string): ChatConvo {
  const members = view.members.filter((m) => m.did !== myDid).map(toMember);
  const kind = view.kind as { $type?: string; name?: string } | undefined;
  const groupName = kind?.$type === GROUP ? kind.name?.trim() : undefined;
  return {
    id: view.id,
    title: groupName || members.map((m) => m.name).join(', '),
    members,
    lastMessage: toMessage(view.lastMessage),
    unread: view.unreadCount,
    muted: view.muted,
    accepted: view.status !== 'request',
  };
}
