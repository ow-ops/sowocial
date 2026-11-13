import type { SearchFilters } from './backend/types';

export type Timeline = 'home' | 'local' | 'public' | { tag: string };
export type NotificationFilter = 'all' | 'mentions' | 'follows';
export type SavedKind = 'bookmarks' | 'favourites';

export const scoped = <K extends readonly unknown[]>(key: K, account?: string) =>
  account ? ([...key, { account }] as const) : key;

export function foreignAccountOf(key: readonly unknown[]): string | undefined {
  const last = key.at(-1);
  return typeof last === 'object' && last !== null && 'account' in last && typeof last.account === 'string' ? last.account : undefined;
}

export const keys = {
  // Lists under this root are updated when a post is liked, favourited or deleted.
  timelines: ['timeline'] as const,
  saved: (kind: SavedKind) => ['timeline', 'saved', kind] as const,
  trending: (kind: 'statuses' | 'tags' | 'links') =>
    (kind === 'statuses' ? ['timeline', 'trending', kind] : ['trending', kind]) as readonly string[],
  trendsAvailable: ['trends-available'] as const,
  bskyTrends: ['bsky-trends'] as const,
  search: (q: string, filters?: SearchFilters) => ['search', q, filters ?? {}] as const,
  lists: ['lists'] as const,
  list: (id: string) => ['lists', id] as const,
  listMembers: (id: string) => ['lists', id, 'members'] as const,
  listTimeline: (id: string) => ['timeline', 'list', id] as const,
  modLists: ['mod-lists'] as const,
  modListSubscriptions: (kind: 'mute' | 'block') => ['mod-lists', kind] as const,
  filters: ['filters'] as const,
  timeline: (t: Timeline) => ['timeline', typeof t === 'string' ? t : `tag:${t.tag}`] as const,
  mixedTimeline: (apKey: string, bskyKey: string) => ['timeline', 'mixed', apKey, bskyKey] as const,
  accountHome: (accountKey: string) => ['timeline', 'home-of', accountKey] as const,
  accountStatusesAll: ['account-statuses'] as const,
  accountStatuses: (id: string, filter: string, account?: string) => scoped(['account-statuses', id, filter] as const, account),
  notifications: ['notifications'] as const,
  notificationList: (filter: NotificationFilter) => ['notifications', filter] as const,
  bskyUnreadCount: ['bsky-unread-count'] as const,
  latestNotification: ['latest-notification'] as const,
  markers: ['markers'] as const,
  homePosition: (accountKey: string) => ['home-position', accountKey] as const,
  conversations: ['conversations'] as const,
  bskyConvos: ['bsky-convos'] as const,
  bskyMessages: (convoId: string) => ['bsky-messages', convoId] as const,
  bskyChatUnread: ['bsky-chat-unread'] as const,
  statuses: ['status'] as const,
  status: (id: string, account?: string) => scoped(['status', id] as const, account),
  threads: ['thread'] as const,
  thread: (id: string, account?: string) => scoped(['thread', id] as const, account),
  statusSource: (id: string | undefined, account?: string) => scoped(['status-source', id] as const, account),
  statusHistory: (id: string, account?: string) => scoped(['status-history', id] as const, account),
  accounts: ['account'] as const,
  account: (id: string, account?: string) => scoped(['account', id] as const, account),
  relationship: (id: string, account?: string) => scoped(['relationship', id] as const, account),
  credentials: ['credentials'] as const,
  accountExtrasAll: ['account-extras'] as const,
  accountExtras: (kind: 'featured-tags' | 'endorsements' | 'familiar', id: string, account?: string) =>
    scoped(['account-extras', kind, id] as const, account),
  accountList: (...parts: string[]) => ['account-list', ...parts] as const,
  instance: ['instance'] as const,
  instanceTimeline: (domain: string) => ['instance', domain] as const,
  serverFeatures: ['server-features'] as const,
  announcements: ['announcements'] as const,
  reactors: (id: string, account?: string) => scoped(['reactors', id] as const, account),
  pushOn: (account: string) => ['push-on', account] as const,
  linkPreview: (url: string) => ['link-preview', url] as const,
  followingSearch: (q: string) => ['account-search', 'following', q] as const,
  suggestions: (kind: string, q: string) => ['suggestions', kind, q] as const,
  scheduled: ['scheduled-statuses'] as const,
  customEmojis: ['custom-emojis'] as const,
  themeCatalog: ['theme-catalog'] as const,
  oauthCallback: (code: string, state: string) => ['oauth-callback', code, state] as const,
  bskyOAuthCallback: ['bsky-oauth-callback'] as const,
  tag: (name: string) => ['tag', name] as const,
  followedTags: ['tag', 'followed'] as const,
  bskyPreferences: (accountKey: string) => ['bsky-preferences', accountKey] as const,
  moderationReports: (accountKey: string) => ['moderation', 'reports', accountKey] as const,
  moderationReport: (accountKey: string, id: string) => ['moderation', 'report', accountKey, id] as const,
  bskyModeration: (accountKey: string) => ['bsky-moderation', accountKey] as const,
  bskyFeeds: ['bsky-feeds'] as const,
  suggestedFollows: ['suggested-follows'] as const,
  editableProfile: ['editable-profile'] as const,
  bskyFeed: (uri: string) => ['bsky-feeds', 'generator', uri] as const,
  bskySuggestedFeeds: ['bsky-feeds', 'suggested'] as const,
  bskyFeedSearch: (q: string) => ['bsky-feeds', 'search', q] as const,
  bskyStarterPacks: ['bsky-starter-packs'] as const,
  bskyStarterPack: (id: string) => ['bsky-starter-packs', id] as const,
  bskyActorStarterPacks: (actor: string) => ['bsky-starter-packs', 'actor', actor] as const,
  feedTimeline: (uri: string) => ['timeline', 'feed', uri] as const,
};
