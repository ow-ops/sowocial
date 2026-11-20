import {
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedVideo,
  AppBskyFeedDefs,
  AppBskyFeedPost,
  AtUri,
  RichText,
  type AppBskyActorDefs,
  type AppBskyNotificationListNotifications,
  type AppBskyRichtextFacet,
  type ComAtprotoLabelDefs,
} from '@atproto/api';

import type { RichContent, Segment } from '../content';
import { pageOf } from '../page';
import type { Author, Card, Hashtag, Media, Mention, Notification, NotificationType, Post, Relationship } from '../post';

type AnyProfile =
  | AppBskyActorDefs.ProfileViewBasic
  | AppBskyActorDefs.ProfileView
  | AppBskyActorDefs.ProfileViewDetailed;

const POST_COLLECTION = 'app.bsky.feed.post';
const SENSITIVE_LABELS = new Set(['porn', 'sexual', 'nudity', 'graphic-media']);

export const postId = (uri: string) => {
  const { hostname, rkey } = new AtUri(uri);
  return `${hostname}@${rkey}`;
};

export const postUri = (id: string) => {
  const at = id.indexOf('@');
  return `at://${id.slice(0, at)}/${POST_COLLECTION}/${id.slice(at + 1)}`;
};

export const profileUrl = (actor: string) => `https://bsky.app/profile/${actor}`;

export function toSegments(text: string, facets?: AppBskyRichtextFacet.Main[]): Segment[] {
  const out: Segment[] = [];
  const pushText = (value: string) => {
    value.split('\n').forEach((line, i) => {
      if (i > 0) out.push({ type: 'break' });
      if (line) out.push({ type: 'text', text: line });
    });
  };
  for (const segment of new RichText({ text, facets }).segments()) {
    if (segment.link) out.push({ type: 'link', text: segment.text, url: segment.link.uri });
    else if (segment.mention) out.push({ type: 'mention', text: segment.text, id: segment.mention.did });
    else if (segment.tag) out.push({ type: 'tag', text: segment.text, name: segment.tag.tag });
    else pushText(segment.text);
  }
  return out;
}

const segmentsContent = (segments: Segment[]): RichContent => ({ kind: 'segments', segments });

function bio(description: string): RichContent {
  const rt = new RichText({ text: description });
  rt.detectFacetsWithoutResolution();
  return segmentsContent(
    toSegments(
      rt.text,
      rt.facets?.filter((f) => f.features.every((x) => x.$type !== 'app.bsky.richtext.facet#mention')),
    ),
  );
}

export function toAuthor(profile: AnyProfile): Author {
  const detailed = profile as AppBskyActorDefs.ProfileViewDetailed;
  const counts =
    detailed.postsCount === undefined
      ? undefined
      : {
          posts: detailed.postsCount,
          following: detailed.followsCount ?? 0,
          followers: detailed.followersCount ?? 0,
        };
  return {
    uid: `bsky:${profile.did}`,
    protocol: 'bsky',
    id: profile.did,
    handle: profile.handle,
    username: profile.handle,
    displayName: profile.displayName || profile.handle,
    avatar: profile.avatar ?? '',
    header: detailed.banner,
    pronouns: profile.pronouns?.trim() || undefined,
    createdAt: profile.createdAt,
    note: 'description' in profile && profile.description ? bio(profile.description) : undefined,
    counts,
    url: profileUrl(profile.handle),
    raw: { bsky: profile },
  };
}

export const toRelationship = (viewer: AppBskyActorDefs.ViewerState = {}): Relationship => ({
  following: !!viewer.following,
  followedBy: !!viewer.followedBy,
  requested: false,
  blocking: !!viewer.blocking,
  muting: !!viewer.muted,
  followUri: viewer.following,
  blockUri: viewer.blocking,
});

const aspect = (ratio?: { width: number; height: number }) => (ratio ? ratio.width / ratio.height : undefined);

function hostnameOf(uri: string) {
  try {
    return new URL(uri).hostname;
  } catch {
    return undefined;
  }
}

function mediaFrom(value: unknown): { media: Media[]; card?: Card } {
  if (AppBskyEmbedImages.isView(value)) {
    const embed = value as AppBskyEmbedImages.View;
    return {
      media: embed.images.map((image, i) => ({
        id: `${i}:${image.fullsize}`,
        kind: 'image',
        url: image.fullsize,
        previewUrl: image.thumb,
        alt: image.alt || undefined,
        aspect: aspect(image.aspectRatio),
      })),
    };
  }
  if (AppBskyEmbedVideo.isView(value)) {
    const embed = value as AppBskyEmbedVideo.View;
    return {
      media: [
        {
          id: embed.cid,
          kind: embed.presentation === 'gif' ? 'gifv' : 'video',
          url: embed.playlist,
          previewUrl: embed.thumbnail ?? null,
          alt: embed.alt || undefined,
          aspect: aspect(embed.aspectRatio),
        },
      ],
    };
  }
  if (AppBskyEmbedExternal.isView(value)) {
    const { uri, title, description, thumb } = (value as AppBskyEmbedExternal.View).external;
    return { media: [], card: { url: uri, title, description, image: thumb, provider: hostnameOf(uri) } };
  }
  return { media: [] };
}

function embedParts(embed: unknown): { media: Media[]; card?: Card; quote?: Post } {
  if (AppBskyEmbedRecord.isView(embed)) return { media: [], quote: quoteFrom(embed as AppBskyEmbedRecord.View) };
  if (AppBskyEmbedRecordWithMedia.isView(embed)) {
    const { media, record } = embed as AppBskyEmbedRecordWithMedia.View;
    return { ...mediaFrom(media), quote: quoteFrom(record) };
  }
  return mediaFrom(embed);
}

function quoteFrom(view: AppBskyEmbedRecord.View): Post | undefined {
  if (!AppBskyEmbedRecord.isViewRecord(view.record)) return undefined;
  const record = view.record as AppBskyEmbedRecord.ViewRecord;
  return toPost({
    uri: record.uri,
    cid: record.cid,
    author: record.author,
    record: record.value,
    embed: record.embeds?.[0],
    replyCount: record.replyCount,
    repostCount: record.repostCount,
    likeCount: record.likeCount,
    quoteCount: record.quoteCount,
    indexedAt: record.indexedAt,
    labels: record.labels,
  });
}

const isSensitive = (labels: ComAtprotoLabelDefs.Label[] = []) =>
  labels.some((l) => !l.neg && SENSITIVE_LABELS.has(l.val));

function facetLists(facets: AppBskyRichtextFacet.Main[] = [], extraTags: string[] = []) {
  const tags: Hashtag[] = [];
  const mentions: Mention[] = [];
  for (const facet of facets) {
    for (const feature of facet.features) {
      if (feature.$type === 'app.bsky.richtext.facet#tag' && 'tag' in feature) {
        tags.push({ name: String(feature.tag), url: `https://bsky.app/hashtag/${feature.tag}` });
      } else if (feature.$type === 'app.bsky.richtext.facet#mention' && 'did' in feature) {
        const did = String(feature.did);
        mentions.push({ id: did, handle: did, url: profileUrl(did) });
      }
    }
  }
  for (const tag of extraTags) {
    if (!tags.some((t) => t.name === tag)) tags.push({ name: tag, url: `https://bsky.app/hashtag/${tag}` });
  }
  return { tags, mentions };
}

export function toPost(view: AppBskyFeedDefs.PostView, reason?: AppBskyFeedDefs.FeedViewPost['reason'], parent?: AppBskyFeedDefs.ReplyRef['parent']): Post {
  const record = AppBskyFeedPost.isRecord(view.record) ? (view.record as AppBskyFeedPost.Record) : undefined;
  const repost = reason && AppBskyFeedDefs.isReasonRepost(reason) ? (reason as AppBskyFeedDefs.ReasonRepost) : undefined;
  const uid = `bsky:${view.uri}`;
  const { media, card, quote } = embedParts(view.embed);
  const { tags, mentions } = facetLists(record?.facets, record?.tags);
  const parentRef = record?.reply?.parent;
  const parentPost = parent && AppBskyFeedDefs.isPostView(parent) ? (parent as AppBskyFeedDefs.PostView) : undefined;
  const createdAt = record?.createdAt ?? view.indexedAt;

  return {
    uid,
    key: repost ? `${uid}:${repost.by.did}` : uid,
    cursor: uid,
    id: postId(view.uri),
    protocol: 'bsky',
    uri: view.uri,
    cid: view.cid,
    rootRef: record?.reply ? { uri: record.reply.root.uri, cid: record.reply.root.cid } : undefined,
    author: toAuthor(view.author),
    createdAt,
    sortAt: repost?.indexedAt ?? createdAt,
    content: segmentsContent(record ? toSegments(record.text, record.facets) : []),
    sensitive: isSensitive(view.labels),
    media,
    card,
    quote,
    repostedBy: repost ? toAuthor(repost.by) : undefined,
    replyTo: parentRef
      ? {
          id: postId(parentRef.uri),
          authorId: new AtUri(parentRef.uri).hostname,
          handle: parentPost?.author.handle,
          post: parentPost && toPost(parentPost),
        }
      : undefined,
    counts: { replies: view.replyCount ?? 0, reposts: view.repostCount ?? 0, likes: view.likeCount ?? 0 },
    viewer: {
      liked: !!view.viewer?.like,
      reposted: !!view.viewer?.repost,
      likeUri: view.viewer?.like,
      repostUri: view.viewer?.repost,
      muted: view.viewer?.threadMuted,
      replyDisabled: view.viewer?.replyDisabled,
      bookmarked: !!view.viewer?.bookmarked,
      pinned: !!view.viewer?.pinned,
      quotable: !view.viewer?.embeddingDisabled,
    },
    tags,
    mentions,
    language: record?.langs?.[0],
    url: `${profileUrl(view.author.handle)}/post/${new AtUri(view.uri).rkey}`,
    bridgyOriginalUrl: bridgedOriginalUrl(view.record),
    capabilities: {
      bookmark: true,
      edit: false,
      poll: false,
      visibility: false,
      pin: true,
      muteThread: false,
      reblog: true,
      redraft: false,
      autoReveal: false,
      embeddedCard: true,
    },
    raw: { bsky: view },
  };
}

const bridgedOriginalUrl = (record: unknown) => {
  const url = (record as { bridgyOriginalUrl?: unknown } | undefined)?.bridgyOriginalUrl;
  return typeof url === 'string' ? url : undefined;
};

const toFeedPost = (item: AppBskyFeedDefs.FeedViewPost) => toPost(item.post, item.reason, item.reply?.parent);

export const toPage = (items: AppBskyFeedDefs.FeedViewPost[], cursor?: string) => pageOf(items.map(toFeedPost), cursor);

export const toPostPage = (posts: AppBskyFeedDefs.PostView[], cursor?: string) => pageOf(posts.map((p) => toPost(p)), cursor);

export function toThread(root: AppBskyFeedDefs.ThreadViewPost) {
  const ancestors: Post[] = [];
  let node = root.parent;
  while (node && AppBskyFeedDefs.isThreadViewPost(node)) {
    const view = node as AppBskyFeedDefs.ThreadViewPost;
    ancestors.unshift(toPost(view.post));
    node = view.parent;
  }
  const descendants: Post[] = [];
  const walk = (replies: AppBskyFeedDefs.ThreadViewPost['replies']) => {
    for (const reply of replies ?? []) {
      if (!AppBskyFeedDefs.isThreadViewPost(reply)) continue;
      const view = reply as AppBskyFeedDefs.ThreadViewPost;
      descendants.push(toPost(view.post));
      walk(view.replies);
    }
  };
  walk(root.replies);
  return { post: toPost(root.post), ancestors, descendants };
}

const NOTIFICATION_TYPES: Record<string, NotificationType> = {
  like: 'like',
  'like-via-repost': 'like',
  repost: 'repost',
  'repost-via-repost': 'repost',
  follow: 'follow',
  mention: 'mention',
  reply: 'mention',
  quote: 'quote',
  'subscribed-post': 'post',
};

const SUBJECT_REASONS = new Set(['like', 'repost']);
const RECORD_REASONS = new Set(['mention', 'reply', 'quote', 'subscribed-post']);

export const notificationType = (reason: string): NotificationType => NOTIFICATION_TYPES[reason] ?? 'other';

export function notificationPostUri(n: AppBskyNotificationListNotifications.Notification): string | undefined {
  const uri = SUBJECT_REASONS.has(n.reason) ? n.reasonSubject : RECORD_REASONS.has(n.reason) ? n.uri : undefined;
  if (!uri) return undefined;
  return new AtUri(uri).collection === POST_COLLECTION ? uri : undefined;
}

export function toNotification(
  n: AppBskyNotificationListNotifications.Notification,
  posts: ReadonlyMap<string, Post> = new Map(),
): Notification {
  const uri = notificationPostUri(n);
  return {
    id: n.uri,
    protocol: 'bsky',
    type: notificationType(n.reason),
    nativeType: n.reason,
    author: toAuthor(n.author),
    post: uri ? posts.get(uri) : undefined,
    createdAt: n.indexedAt,
    raw: { bsky: n },
  };
}
