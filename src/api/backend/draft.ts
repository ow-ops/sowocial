import type { Post, StrongRef, Visibility } from '@/model/post';

export type MediaFocus = { x: number; y: number };

export type MediaDraft = { uri: string; description: string; focus?: MediaFocus };

export type PollDraft = { options: string[]; multiple: boolean; hideTotals: boolean; expiresIn: number };

export type ReplyRef = { root: StrongRef; parent: StrongRef };

export type VideoDraft = {
  uri: string;
  description: string;
  width: number;
  height: number;
  size: number;
  durationMs: number;
  mimeType: string;
};

export type VideoProgress = { stage: 'checking' | 'uploading' | 'processing'; progress: number };

export const SELF_LABELS = ['sexual', 'nudity', 'porn', 'graphic-media'] as const;

export type SelfLabel = (typeof SELF_LABELS)[number];

export const REPLY_AUDIENCES = ['everyone', 'following', 'mentioned', 'nobody'] as const;

export type ReplyAudience = (typeof REPLY_AUDIENCES)[number];

export type PostInteractions = { replies: ReplyAudience; quotes: boolean };

export const OPEN_INTERACTIONS: PostInteractions = { replies: 'everyone', quotes: true };

export type Audience = 'everyone' | 'followers' | 'mentioned';

export type InteractionAudiences = { reply: Audience; reblog: Audience; favourite: Audience };

export const OPEN_AUDIENCES: InteractionAudiences = { reply: 'everyone', reblog: 'everyone', favourite: 'everyone' };

export type GtsPostParams = {
  localOnly?: boolean;
  contentType?: 'text/plain' | 'text/markdown';
  interactionPolicy?: Partial<Record<'canReply' | 'canReblog' | 'canFavourite', { automaticApproval: string[] }>>;
  scheduledAt?: string;
};

const APPROVAL: Record<Audience, string[]> = {
  everyone: ['public'],
  followers: ['author', 'followers'],
  mentioned: ['author', 'mentioned'],
};

export function toInteractionPolicy({ reply, reblog, favourite }: InteractionAudiences): GtsPostParams['interactionPolicy'] {
  const policy: NonNullable<GtsPostParams['interactionPolicy']> = {};
  if (reply !== 'everyone') policy.canReply = { automaticApproval: APPROVAL[reply] };
  if (reblog !== 'everyone') policy.canReblog = { automaticApproval: APPROVAL[reblog] };
  if (favourite !== 'everyone') policy.canFavourite = { automaticApproval: APPROVAL[favourite] };
  return Object.keys(policy).length ? policy : undefined;
}

type ApDraftExtras = {
  gts?: GtsPostParams;
  keepMediaIds?: string[];
  mediaAttributes?: { id: string; description: string }[];
};

type BskyDraftExtras = {
  parent?: Post;
  replyRef?: ReplyRef;
  label?: SelfLabel;
  interactions?: PostInteractions;
  video?: VideoDraft;
};

type DraftBase = {
  status: string;
  spoilerText?: string;
  visibility: Visibility;
  inReplyToId?: string;
  media: MediaDraft[];
  editId?: string;
  language?: string;
  sensitive?: boolean;
  quote?: Post;
  poll?: PollDraft;
  // Makes a retry safe: the Idempotency-Key header on the fediverse, the record key (a TID) on Bluesky.
  idempotencyKey?: string;
  onVideoProgress?: (progress: VideoProgress) => void;
};

// What only one network understands lives in its own part, and a draft carries at most one.
export type PostDraft = DraftBase & ({ ap?: ApDraftExtras; bsky?: never } | { bsky?: BskyDraftExtras; ap?: never });
