import type { AppBskyActorDefs, AppBskyFeedDefs, AppBskyNotificationListNotifications } from '@atproto/api';
import type { mastodon } from 'masto';

import type { RichContent } from './content';

export type Protocol = 'ap' | 'bsky';

export type Visibility = 'public' | 'unlisted' | 'private' | 'direct';

export type Emoji = { shortcode: string; url: string };

export type Mention = { id: string; handle: string; url: string };

export type Hashtag = { name: string; url: string };

export type Media = {
  id: string;
  kind: 'image' | 'video' | 'gifv' | 'audio' | 'unknown';
  url: string | null;
  previewUrl: string | null;
  alt?: string;
  aspect?: number;
  blurhash?: string;
  focus?: { x: number; y: number };
};

export type Card = {
  url: string;
  title: string;
  description: string;
  image?: string;
  provider?: string;
};

export type PollOption = { title: string; votesCount?: number; emojis: Emoji[] };

export type Poll = {
  id: string;
  expiresAt?: string;
  expired: boolean;
  multiple: boolean;
  votesCount: number;
  votersCount?: number;
  voted: boolean;
  ownVotes: number[];
  options: PollOption[];
};

export type ProfileField = { name: string; value: RichContent; verifiedAt?: string };

export type AuthorRole = { name: string; color?: string };

type AuthorFields = {
  uid: string;
  id: string;
  handle: string;
  username: string;
  displayName: string;
  avatar: string;
  header?: string;
  emojis?: Emoji[];
  bot?: boolean;
  locked?: boolean;
  fields?: ProfileField[];
  pronouns?: string;
  roles?: AuthorRole[];
  createdAt?: string;
  note?: RichContent;
  counts?: { posts: number; following: number; followers: number };
  url: string;
};

export type Author = AuthorFields &
  (
    | { protocol: 'ap'; raw?: { ap: mastodon.v1.Account } }
    | {
        protocol: 'bsky';
        raw?: {
          bsky:
            | AppBskyActorDefs.ProfileViewBasic
            | AppBskyActorDefs.ProfileView
            | AppBskyActorDefs.ProfileViewDetailed;
        };
      }
  );

export type Capabilities = {
  bookmark: boolean;
  edit: boolean;
  poll: boolean;
  visibility: boolean;
  pin: boolean;
  muteThread: boolean;
};

export type Viewer = {
  liked: boolean;
  reposted: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
  muted?: boolean;
  likeUri?: string;
  repostUri?: string;
  replyDisabled?: boolean;
};

export type Relationship = Pick<
  mastodon.v1.Relationship,
  'following' | 'followedBy' | 'requested' | 'blocking' | 'muting'
> & { requestedBy?: boolean; note?: string | null; followUri?: string; blockUri?: string };

export type PostFilter = { title: string; action: 'warn' | 'hide' };

type PostFields = {
  uid: string;
  key: string;
  accountKey?: string;
  cursor: string;
  id: string;
  author: Author;
  createdAt: string;
  sortAt: string;
  content: RichContent;
  contentWarning?: string;
  sensitive: boolean;
  media: Media[];
  card?: Card;
  quote?: Post;
  repostedBy?: Author;
  wrapperId?: string;
  replyTo?: { id: string; authorId?: string; handle?: string };
  counts: { replies: number; reposts: number; likes: number };
  viewer: Viewer;
  visibility?: Visibility;
  poll?: Poll;
  editedAt?: string;
  emojis?: Emoji[];
  tags?: Hashtag[];
  mentions?: Mention[];
  language?: string;
  url: string;
  filters?: PostFilter[];
  labels?: string[];
  capabilities: Capabilities;
};

export type Post = PostFields &
  (
    | { protocol: 'ap'; raw?: { ap: mastodon.v1.Status } }
    | {
        protocol: 'bsky';
        uri: string;
        cid: string;
        rootRef?: StrongRef;
        raw?: { bsky: AppBskyFeedDefs.PostView };
      }
  );

export type StrongRef = { uri: string; cid: string };

export type BskyPost = Extract<Post, { protocol: 'bsky' }>;

export type NotificationType =
  | 'mention'
  | 'post'
  | 'repost'
  | 'like'
  | 'follow'
  | 'follow_request'
  | 'poll'
  | 'update'
  | 'quote'
  | 'other';

type NotificationFields = {
  id: string;
  type: NotificationType;
  nativeType: string;
  author: Author;
  post?: Post;
  createdAt: string;
  cursor?: string;
};

export type Notification = NotificationFields &
  (
    | { protocol: 'ap'; raw?: { ap: mastodon.v1.Notification } }
    | { protocol: 'bsky'; raw?: { bsky: AppBskyNotificationListNotifications.Notification } }
  );

export const pageCursor = (item: { id: string; cursor?: string }) => item.cursor ?? item.id;
