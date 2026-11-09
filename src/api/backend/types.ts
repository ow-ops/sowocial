import type { Author, BskyPost, Notification, Post, Protocol, Relationship, Visibility } from '@/model/post';

import type { StatusAction } from '../cache';
import type { NotificationFilter, Timeline } from '../keys';
import type { GtsPostParams } from '../ap/compose';
import type { PostInteractions, SelfLabel } from '../bsky/compose';
import type { VideoDraft, VideoProgress } from '../bsky/video';

export type BackendCapabilities = {
  protocol: Protocol;
  paging: 'maxId' | 'cursor';
  localTimeline: boolean;
  bookmarks: boolean;
  streaming: boolean;
  resolveLinks: boolean;
  lists: boolean;
  filters: boolean;
  moderationLists: boolean;
  domainBlocks: boolean;
  serverInfo: boolean;
  edit: boolean;
  editProfile: boolean;
  privateNotes: boolean;
  muteOptions: boolean;
  pinnedPosts: boolean;
  scheduled: boolean;
  trends: boolean;
  markers: boolean;
  push: boolean;
  customEmojis: boolean;
  suggestions: boolean;
  unreadCount: boolean;
  conversations: boolean;
  tags: boolean;
  visibility: boolean;
  mentionRecipients: boolean;
  interactionControls: boolean;
  services: boolean;
  chat: boolean;
  video: boolean;
  selfLabels: boolean;
  graphemeLimit: boolean;
  mediaFocus: boolean;
  contentWarning: boolean;
  labels: boolean;
  feeds: boolean;
};

export type MediaFocus = { x: number; y: number };

export type MediaDraft = { uri: string; description: string; focus?: MediaFocus };

export type PostDraft = {
  status: string;
  spoilerText?: string;
  visibility: Visibility;
  inReplyToId?: string;
  media: MediaDraft[];
  editId?: string;
  keepMediaIds?: string[];
  language?: string;
  sensitive?: boolean;
  gts?: GtsPostParams;
  parent?: BskyPost;
  quote?: BskyPost;
  label?: SelfLabel;
  interactions?: PostInteractions;
  video?: VideoDraft;
  onVideoProgress?: (progress: VideoProgress) => void;
};

export type PostOutcome =
  | { kind: 'indexing' }
  | { kind: 'scheduled' }
  | { kind: 'edited'; post: Post }
  | { kind: 'created'; reply: boolean };

export type ProfileFilter = 'posts' | 'replies' | 'media' | 'pinned';

export type FollowKind = 'followers' | 'following';

export type RelationshipChange = 'follow' | 'unfollow' | 'mute' | 'unmute' | 'block' | 'unblock';

export type MuteOptions = { duration: number; notifications: boolean };

export type SearchTag = { name: string; following?: boolean | null };

export type SearchResults = { accounts: Author[]; statuses: Post[]; hashtags: SearchTag[] };

export type ReportInput = {
  accountId: string;
  statusIds?: string[];
  comment: string;
  forward: boolean;
  category: 'spam' | 'violation' | 'other';
  post?: Post;
};

export type Thread = { ancestors: Post[]; descendants: Post[] };

export type Backend = {
  protocol: Protocol;
  capabilities: BackendCapabilities;
  timelinePage(timeline: Timeline, cursor?: string): Promise<Post[]>;
  getPost(id: string): Promise<Post>;
  getThread(id: string): Promise<Thread>;
  reserveAction(post: Post, action: StatusAction): boolean;
  postAction(post: Post, action: StatusAction, on: boolean): Promise<(current: Post) => Post>;
  deletePost(post: Post): Promise<void>;
  profile(id: string): Promise<Author>;
  profilePosts(id: string, filter: ProfileFilter, cursor?: string): Promise<Post[]>;
  follows(id: string, kind: FollowKind): AsyncIterable<Author[]>;
  relationship(id: string): Promise<Relationship | null>;
  setRelationship(id: string, change: RelationshipChange, options?: MuteOptions): Promise<Relationship>;
  search(q: string): Promise<SearchResults>;
  resolveUrl(url: string, signal?: AbortSignal): Promise<{ type: 'status' | 'account'; id: string } | null>;
  notificationsPage(filter: NotificationFilter, cursor?: string): Promise<Notification[]>;
  unreadNotifications(): Promise<number>;
  post(draft: PostDraft, signal: AbortSignal): Promise<PostOutcome>;
  report(input: ReportInput): Promise<void>;
};
