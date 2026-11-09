import type { ChatBskyConvoDefs } from '@atproto/api';

import { chatErrorMessage } from '@/api/bsky/chat-error';
import { toConvo, toMessage } from '@/model/adapters/bsky-chat';

const me = { did: 'did:plc:me', handle: 'me.test' };
const them = { did: 'did:plc:them', handle: 'them.test', displayName: ' Them ', avatar: 'https://cdn/a.jpg' };

type TypedMessage = ChatBskyConvoDefs.MessageView & { $type: 'chat.bsky.convo.defs#messageView' };

const message = (overrides: Partial<ChatBskyConvoDefs.MessageView> = {}): TypedMessage => ({
  $type: 'chat.bsky.convo.defs#messageView',
  id: 'm1',
  rev: '1',
  text: 'hello',
  sender: { did: them.did },
  sentAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const convo = (overrides: Partial<ChatBskyConvoDefs.ConvoView> = {}): ChatBskyConvoDefs.ConvoView => ({
  id: 'c1',
  rev: '1',
  members: [me, them],
  muted: false,
  unreadCount: 2,
  status: 'accepted',
  lastMessage: message(),
  ...overrides,
});

describe('toMessage', () => {
  it('maps a message', () => {
    expect(toMessage(message())).toEqual({
      id: 'm1',
      sentAt: '2026-01-01T00:00:00.000Z',
      senderDid: them.did,
      text: 'hello',
      deleted: false,
    });
  });

  it('marks a deleted message and drops its text', () => {
    const deleted = { $type: 'chat.bsky.convo.defs#deletedMessageView', id: 'm2', rev: '2', sender: { did: me.did }, sentAt: 'x' };
    expect(toMessage(deleted)).toEqual({ id: 'm2', sentAt: 'x', senderDid: me.did, text: '', deleted: true });
  });

  it('skips system and unknown messages', () => {
    expect(toMessage({ $type: 'chat.bsky.convo.defs#systemMessageView' })).toBeUndefined();
    expect(toMessage(undefined)).toBeUndefined();
  });
});

describe('toConvo', () => {
  it('lists the other members, titles by their names and counts unread', () => {
    const c = toConvo(convo(), me.did);
    expect(c.title).toBe('Them');
    expect(c.members).toEqual([
      { did: them.did, handle: them.handle, name: 'Them', avatar: 'https://cdn/a.jpg', chatDisabled: false },
    ]);
    expect(c.unread).toBe(2);
    expect(c.accepted).toBe(true);
    expect(c.lastMessage?.text).toBe('hello');
  });

  it('falls back to the handle and flags disabled chat', () => {
    const c = toConvo(convo({ members: [me, { did: 'did:plc:x', handle: 'x.test', chatDisabled: true }] }), me.did);
    expect(c.title).toBe('x.test');
    expect(c.members[0].chatDisabled).toBe(true);
  });

  it('names a group by its title', () => {
    const c = toConvo(
      convo({ kind: { $type: 'chat.bsky.convo.defs#groupConvo', name: ' Book club ' } as ChatBskyConvoDefs.ConvoView['kind'] }),
      me.did,
    );
    expect(c.title).toBe('Book club');
  });

  it('marks requests and keeps a conversation without a last message', () => {
    const c = toConvo(convo({ status: 'request', lastMessage: undefined, muted: true }), me.did);
    expect(c.accepted).toBe(false);
    expect(c.lastMessage).toBeUndefined();
    expect(c.muted).toBe(true);
  });
});

describe('chatErrorMessage', () => {
  it('explains disabled chat', () => {
    expect(chatErrorMessage({ error: 'MessagesDisabled', status: 400 })).toMatch(/turned off direct messages/);
  });

  it('explains follow-only recipients and blocks', () => {
    expect(chatErrorMessage({ error: 'NotFollowedBySender' })).toMatch(/people they follow/);
    expect(chatErrorMessage({ error: 'BlockedActor' })).toMatch(/block/);
  });

  it('explains a missing chat scope', () => {
    expect(chatErrorMessage({ status: 401, error: 'InvalidToken', message: 'Bad token scope' })).toMatch(/app password/);
  });

  it('falls back to the server message', () => {
    expect(chatErrorMessage({ status: 500, message: 'boom' })).toBe('boom');
  });
});
