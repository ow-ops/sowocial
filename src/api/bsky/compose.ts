import type {
  AppBskyEmbedImages,
  AppBskyEmbedVideo,
  AppBskyFeedPost,
  AppBskyFeedPostgate,
  AppBskyFeedThreadgate,
  BlobRef,
} from '@atproto/api';
import { countGraphemes } from 'unicode-segmenter/grapheme';

import type { BskyPost, StrongRef } from '@/model/post';

import type { PostVideo } from './video';

export const MAX_GRAPHEMES = 300;
export const MAX_IMAGES = 4;

export const SELF_LABELS = ['sexual', 'nudity', 'porn', 'graphic-media'] as const;

export type SelfLabel = (typeof SELF_LABELS)[number];

export type PostImage = { image: BlobRef; alt: string; aspectRatio: { width: number; height: number } };

export const graphemeCount = countGraphemes;

export const strongRef = (post: BskyPost): StrongRef => ({ uri: post.uri, cid: post.cid });

export function replyRefs(parent: BskyPost) {
  return { root: parent.rootRef ?? strongRef(parent), parent: strongRef(parent) };
}

export function buildEmbed(
  quote: StrongRef | undefined,
  images: PostImage[],
  video?: PostVideo,
): AppBskyFeedPost.Record['embed'] {
  const media: AppBskyEmbedImages.Main | AppBskyEmbedVideo.Main | undefined = video
    ? { $type: 'app.bsky.embed.video', video: video.video, alt: video.alt || undefined, aspectRatio: video.aspectRatio, presentation: video.presentation }
    : images.length
      ? { $type: 'app.bsky.embed.images', images }
      : undefined;
  const record = quote ? { $type: 'app.bsky.embed.record' as const, record: quote } : undefined;
  if (record && media) {
    return { $type: 'app.bsky.embed.recordWithMedia', record, media: { ...media, $type: media.$type! } } as AppBskyFeedPost.Record['embed'];
  }
  if (record) return record;
  return media as AppBskyFeedPost.Record['embed'];
}

export const buildLabels = (label?: SelfLabel): AppBskyFeedPost.Record['labels'] =>
  label ? { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: label }] } : undefined;

export const REPLY_AUDIENCES = ['everyone', 'following', 'mentioned', 'nobody'] as const;

export type ReplyAudience = (typeof REPLY_AUDIENCES)[number];

export type PostInteractions = { replies: ReplyAudience; quotes: boolean };

export const OPEN_INTERACTIONS: PostInteractions = { replies: 'everyone', quotes: true };

export function threadgateAllow(audience: ReplyAudience): AppBskyFeedThreadgate.Record['allow'] {
  switch (audience) {
    case 'everyone':
      return undefined;
    case 'following':
      return [{ $type: 'app.bsky.feed.threadgate#followingRule' }];
    case 'mentioned':
      return [{ $type: 'app.bsky.feed.threadgate#mentionRule' }];
    case 'nobody':
      return [];
  }
}

export const postgateRules = (quotes: boolean): AppBskyFeedPostgate.Record['embeddingRules'] =>
  quotes ? undefined : [{ $type: 'app.bsky.feed.postgate#disableRule' }];
