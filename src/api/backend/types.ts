import type { Page } from '@/model/page';
import type { Author, Notification, Post, Protocol, Relationship, StrongRef } from '@/model/post';

import type { NotificationFilter, Timeline } from '../keys';
import type { PostDraft, VideoDraft } from './draft';

export type StatusAction = 'favourite' | 'reblog' | 'bookmark';

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

export type PostOutcome =
  | { kind: 'indexing'; ref: StrongRef }
  | { kind: 'scheduled' }
  | { kind: 'edited'; post: Post }
  | { kind: 'created'; reply: boolean; id: string };

type ProfileFilter = 'posts' | 'replies' | 'media' | 'pinned';

type FollowKind = 'followers' | 'following';
export type InteractionKind = 'likes' | 'reposts';

type RelationshipChange = 'follow' | 'unfollow' | 'mute' | 'unmute' | 'block' | 'unblock';

export type MuteOptions = { duration: number; notifications: boolean };

type SearchTag = { name: string; following?: boolean | null };

type SearchResults = { accounts: Author[]; statuses: Post[]; hashtags: SearchTag[] };

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

type Thread = { ancestors: Post[]; descendants: Post[] };

export type Backend = {
  protocol: Protocol;
  capabilities: BackendCapabilities;
  timelinePage(timeline: Timeline, cursor?: string): Promise<Page<Post>>;
  getPost(id: string): Promise<Post>;
  getThread(id: string): Promise<Thread>;
  reserveAction(post: Post, action: StatusAction): boolean;
  postAction(post: Post, action: StatusAction, on: boolean): Promise<(current: Post) => Post>;
  deletePost(post: Post): Promise<void>;
  profile(id: string): Promise<Author>;
  profilePosts(id: string, filter: ProfileFilter, cursor?: string): Promise<Page<Post>>;
  follows(id: string, kind: FollowKind): AsyncIterable<Author[]>;
  interactions(postId: string, kind: InteractionKind): AsyncIterable<Author[]>;
  relationship(id: string): Promise<Relationship | null>;
  setRelationship(id: string, change: RelationshipChange, options?: MuteOptions): Promise<Relationship>;
  search(q: string, filters?: SearchFilters): Promise<SearchResults>;
  findByHandle(handle: string): Promise<Author | null>;
  resolvesUrl(url: string): boolean;
  resolveUrl(url: string, signal?: AbortSignal): Promise<ResolvedUrl | null>;
  notificationsPage(filter: NotificationFilter, cursor?: string): Promise<Page<Notification>>;
  unreadNotifications(): Promise<number>;
  post(draft: PostDraft, signal: AbortSignal): Promise<PostOutcome>;
  checkVideo(video: VideoDraft): Promise<void>;
  report(input: ReportInput): Promise<void>;
  setPinned(post: Post, pinned: boolean): Promise<void>;
  editableProfile(): Promise<EditableProfile>;
  updateProfile(edit: ProfileEdit): Promise<void>;
  bookmarksPage(cursor?: string): Promise<Page<Post>>;
  suggestedFollows(): Promise<Author[]>;
  lists(): Promise<UserList[]>;
  list(id: string): Promise<UserList>;
  listTimelinePage(id: string, cursor?: string): Promise<Page<Post>>;
  listMembers(id: string): Promise<Author[]>;
  createList(settings: ListSettings): Promise<UserList>;
  updateList(id: string, settings: ListSettings): Promise<UserList>;
  deleteList(id: string): Promise<void>;
  setListMember(id: string, accountId: string, member: boolean): Promise<void>;
  listCandidates(q: string): Promise<Author[]>;
};
