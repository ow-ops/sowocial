export type ChatMember = {
  did: string;
  handle: string;
  name: string;
  avatar?: string;
  chatDisabled: boolean;
};

export type ChatMessage = {
  id: string;
  sentAt: string;
  senderDid: string;
  text: string;
  deleted: boolean;
  cursor?: string;
};

export type ChatConvo = {
  id: string;
  title: string;
  members: ChatMember[];
  lastMessage?: ChatMessage;
  unread: number;
  muted: boolean;
  accepted: boolean;
  cursor?: string;
};
