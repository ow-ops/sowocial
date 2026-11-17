import type { Author, BskyPost, Notification, Post, Protocol, Relationship, StrongRef, Visibility } from '@/model/post';

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
  listPurposes: boolean;
  filters: boolean;
  mutedWords: boolean;
  moderationLists: boolean;
  domainBlocks: boolean;
  serverInfo: boolean;
  edit: boolean;
  editProfile: boolean;
  privateNotes: boolean;
  followRequests: boolean;
  followOptions: boolean;
  profileExtras: boolean;
  muteOptions: boolean;
  pinnedPosts: boolean;
  scheduled: boolean;
  polls: boolean;
  trends: boolean;
  trendingTopics: boolean;
  searchSort: boolean;
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
  quotes: 'always' | 'server';
  mediaFocus: boolean;
  contentWarning: boolean;
  labels: boolean;
  feeds: boolean;
  listSettings: boolean;
  profileFields: boolean;
  suggestedFollows: boolean;
  favourites: boolean;
  starterPacks: boolean;
};

export type MediaFocus = { x: number; y: number };

export type MediaDraft = { uri: string; description: string; focus?: MediaFocus };

export type PollDraft = { options: string[]; multiple: boolean; hideTotals: boolean; expiresIn: number };

export type ReplyRef = { root: StrongRef; parent: StrongRef };

export type PostDraft = {
  status: string;
  spoilerText?: string;
  visibility: Visibility;
  inReplyToId?: string;
  media: MediaDraft[];
  editId?: string;
  keepMediaIds?: string[];
  mediaAttributes?: { id: string; description: string }[];
  language?: string;
  sensitive?: boolean;
  gts?: GtsPostParams;
  parent?: BskyPost;
  quote?: Post;
  label?: SelfLabel;
  interactions?: PostInteractions;
  video?: VideoDraft;
  poll?: PollDraft;
  replyRef?: ReplyRef;
  // Makes a retry safe: the Idempotency-Key header on the fediverse, the record key (a TID) on Bluesky.
  idempotencyKey?: string;
  onVideoProgress?: (progress: VideoProgress) => void;
};

export type PostOutcome =
  | { kind: 'indexing'; ref: StrongRef }
  | { kind: 'scheduled' }
  | { kind: 'edited'; post: Post }
  | { kind: 'created'; reply: boolean; id: string };

export type ProfileFilter = 'posts' | 'replies' | 'media' | 'pinned';

export type FollowKind = 'followers' | 'following';
export type InteractionKind = 'likes' | 'reposts';

export type RelationshipChange = 'follow' | 'unfollow' | 'mute' | 'unmute' | 'block' | 'unblock';

export type MuteOptions = { duration: number; notifications: boolean };

export type SearchTag = { name: string; following?: boolean | null };

export type SearchResults = { accounts: Author[]; statuses: Post[]; hashtags: SearchTag[] };

// Filters apply to posts only. `since` and `until` are ISO dates (YYYY-MM-DD).
export type SearchFilters = { sort?: 'top' | 'latest'; from?: string; since?: string; until?: string; lang?: string };

export type ReportInput = {
  accountId: string;
  statusIds?: string[];
  comment: string;
  forward: boolean;
  category: 'spam' | 'violation' | 'other';
  post?: Post;
};

export type EditableProfile = {
  displayName: string;
  note: string;
  avatar: string;
  header?: string;
  locked: boolean;
  bot: boolean;
  fields: { name: string; value: string }[];
};

export type ProfileEdit = Omit<EditableProfile, 'avatar' | 'header'> & { avatarUri?: string; headerUri?: string };

export type ListPurpose = 'curate' | 'mod';

export type ModListKind = 'mute' | 'block';

export type UserList = {
  id: string;
  title: string;
  repliesPolicy?: 'list' | 'followed' | 'none';
  exclusive?: boolean;
  purpose?: ListPurpose;
};

export type ListSettings = Pick<UserList, 'title' | 'repliesPolicy' | 'exclusive' | 'purpose'>;

export type ResolvedUrl = { type: 'status' | 'account' | 'list' | 'starterPack'; id: string };

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
  interactions(postId: string, kind: InteractionKind): AsyncIterable<Author[]>;
  relationship(id: string): Promise<Relationship | null>;
  setRelationship(id: string, change: RelationshipChange, options?: MuteOptions): Promise<Relationship>;
  search(q: string, filters?: SearchFilters): Promise<SearchResults>;
  findByHandle(handle: string): Promise<Author | null>;
  resolvesUrl(url: string): boolean;
  resolveUrl(url: string, signal?: AbortSignal): Promise<ResolvedUrl | null>;
  notificationsPage(filter: NotificationFilter, cursor?: string): Promise<Notification[]>;
  unreadNotifications(): Promise<number>;
  post(draft: PostDraft, signal: AbortSignal): Promise<PostOutcome>;
  report(input: ReportInput): Promise<void>;
  setPinned(post: Post, pinned: boolean): Promise<void>;
  editableProfile(): Promise<EditableProfile>;
  updateProfile(edit: ProfileEdit): Promise<void>;
  bookmarksPage(cursor?: string): Promise<Post[]>;
  suggestedFollows(): Promise<Author[]>;
  lists(): Promise<UserList[]>;
  list(id: string): Promise<UserList>;
  listTimelinePage(id: string, cursor?: string): Promise<Post[]>;
  listMembers(id: string): Promise<Author[]>;
  createList(settings: ListSettings): Promise<UserList>;
  updateList(id: string, settings: ListSettings): Promise<UserList>;
  deleteList(id: string): Promise<void>;
  setListMember(id: string, accountId: string, member: boolean): Promise<void>;
  listCandidates(q: string): Promise<Author[]>;
};
