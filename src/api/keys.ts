import type { SearchFilters } from './backend/types';

export type Timeline = 'home' | 'local' | 'public' | { tag: string };
export type NotificationFilter = 'all' | 'mentions' | 'follows';
export type SavedKind = 'bookmarks' | 'favourites';

export const timelineId = (t: Timeline) => (typeof t === 'string' ? t : `tag:${t.tag}`);

// Account-dependent keys start with the account, so a prefix like `keys.lists(account)` reaches only its queries.
const of = <K extends readonly unknown[]>(account: string, ...key: K) => [{ account }, ...key] as const;

export function accountOf(key: readonly unknown[]): string | undefined {
  const first = key[0];
  return typeof first === 'object' && first !== null && 'account' in first && typeof first.account === 'string' ? first.account : undefined;
}

export const rootOf = (key: readonly unknown[]) => (accountOf(key) === undefined ? key[0] : key[1]);

export const keys = {
  // Lists under this root are updated when a post is liked, favourited or deleted.
  timelines: (account: string) => of(account, 'timeline'),
  saved: (account: string, kind: SavedKind) => of(account, 'timeline', 'saved', kind),
  trending: (account: string, kind: 'statuses' | 'tags' | 'links') =>
    kind === 'statuses' ? of(account, 'timeline', 'trending', kind) : of(account, 'trending', kind),
  trendsAvailable: (account: string) => of(account, 'trends-available'),
  bskyTrends: (account: string) => of(account, 'bsky-trends'),
  search: (account: string, q: string, filters?: SearchFilters) => of(account, 'search', q, filters ?? {}),
  lists: (account: string) => of(account, 'lists'),
  list: (account: string, id: string) => of(account, 'lists', id),
  listMembers: (account: string, id: string) => of(account, 'lists', id, 'members'),
  listTimeline: (account: string, id: string) => of(account, 'timeline', 'list', id),
  modLists: (account: string) => of(account, 'mod-lists'),
  modListSubscriptions: (account: string, kind: 'mute' | 'block') => of(account, 'mod-lists', kind),
  filters: (account: string) => of(account, 'filters'),
  timeline: (account: string, t: Timeline) => of(account, 'timeline', timelineId(t)),
  // Holds posts of both accounts, each stamped with its own; it is filed under the fediverse one.
  mixedTimeline: (apKey: string, bskyKey: string) => of(apKey, 'timeline', 'mixed', bskyKey),
  accountHome: (account: string) => of(account, 'timeline', 'home-of'),
  accountStatusesAll: (account: string) => of(account, 'account-statuses'),
  accountStatuses: (account: string, id: string, filter: string) => of(account, 'account-statuses', id, filter),
  notifications: (account: string) => of(account, 'notifications'),
  notificationList: (account: string, filter: NotificationFilter) => of(account, 'notifications', filter),
  bskyUnreadCount: (account: string) => of(account, 'bsky-unread-count'),
  latestNotification: (account: string) => of(account, 'latest-notification'),
  accountUnread: (account: string) => of(account, 'account-unread'),
  markers: (account: string) => of(account, 'markers'),
  homePosition: (account: string) => of(account, 'home-position'),
  conversations: (account: string) => of(account, 'conversations'),
  bskyConvos: (account: string) => of(account, 'bsky-convos'),
  bskyMessages: (account: string, convoId: string) => of(account, 'bsky-messages', convoId),
  bskyChatUnread: (account: string) => of(account, 'bsky-chat-unread'),
  statuses: (account: string) => of(account, 'status'),
  status: (account: string, id: string) => of(account, 'status', id),
  threads: (account: string) => of(account, 'thread'),
  thread: (account: string, id: string) => of(account, 'thread', id),
  statusSource: (account: string, id: string | undefined) => of(account, 'status-source', id),
  statusHistory: (account: string, id: string) => of(account, 'status-history', id),
  accounts: (account: string) => of(account, 'account'),
  account: (account: string, id: string) => of(account, 'account', id),
  relationship: (account: string, id: string) => of(account, 'relationship', id),
  credentials: (account: string) => of(account, 'credentials'),
  accountExtrasAll: (account: string) => of(account, 'account-extras'),
  accountExtras: (account: string, kind: 'featured-tags' | 'endorsements' | 'familiar', id: string) =>
    of(account, 'account-extras', kind, id),
  accountList: (account: string, ...parts: string[]) => of(account, 'account-list', ...parts),
  instance: (account: string) => of(account, 'instance'),
  // Unauthenticated, so shared by every account.
  instanceTimeline: (domain: string) => ['instance-timeline', domain] as const,
  publicPost: (domain: string, id: string) => ['public-post', domain, id] as const,
  serverFeatures: (account: string) => of(account, 'server-features'),
  announcements: (account: string) => of(account, 'announcements'),
  reactors: (account: string, id: string) => of(account, 'reactors', id),
  pushOn: (account: string) => of(account, 'push-on'),
  linkPreview: (url: string) => ['link-preview', url] as const,
  gifSearch: (query: string) => ['gif-search', query] as const,
  linkedPost: (account: string, url: string) => of(account, 'linked-post', url),
  followingSearch: (account: string, q: string) => of(account, 'account-search', 'following', q),
  suggestions: (account: string, kind: string, q: string) => of(account, 'suggestions', kind, q),
  scheduled: (account: string) => of(account, 'scheduled-statuses'),
  customEmojis: (account: string) => of(account, 'custom-emojis'),
  themeCatalog: ['theme-catalog'] as const,
  oauthCallback: (code: string, state: string) => ['oauth-callback', code, state] as const,
  bskyOAuthCallback: ['bsky-oauth-callback'] as const,
  tag: (account: string, name: string) => of(account, 'tag', name),
  followedTags: (account: string) => of(account, 'tag', 'followed'),
  bskyPreferences: (account: string) => of(account, 'bsky-preferences'),
  moderationReports: (account: string) => of(account, 'moderation', 'reports'),
  moderationReport: (account: string, id: string) => of(account, 'moderation', 'report', id),
  bskyModeration: (account: string) => of(account, 'bsky-moderation'),
  bskyFeeds: (account: string) => of(account, 'bsky-feeds'),
  suggestedFollows: (account: string) => of(account, 'suggested-follows'),
  editableProfile: (account: string) => of(account, 'editable-profile'),
  bskyFeed: (account: string, uri: string) => of(account, 'bsky-feeds', 'generator', uri),
  bskySuggestedFeeds: (account: string) => of(account, 'bsky-feeds', 'suggested'),
  bskyFeedSearch: (account: string, q: string) => of(account, 'bsky-feeds', 'search', q),
  bskyStarterPacks: (account: string) => of(account, 'bsky-starter-packs'),
  bskyStarterPack: (account: string, id: string) => of(account, 'bsky-starter-packs', id),
  bskyActorStarterPacks: (account: string, actor: string) => of(account, 'bsky-starter-packs', 'actor', actor),
  feedTimeline: (account: string, uri: string) => of(account, 'timeline', 'feed', uri),
};
