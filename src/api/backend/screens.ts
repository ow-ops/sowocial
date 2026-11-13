import type { BackendCapabilities } from './types';

type Requirement = (c: BackendCapabilities) => boolean;

// Screens that depend on the network. Each requirement is the flag that shows the screen's entry point,
// so a row and its screen cannot disagree. Rendered as guarded routes by the root layout.
export const CAPABILITY_SCREENS = {
  federated: (c) => c.localTimeline,
  'followed-tags': (c) => c.tags,
  'follow-requests': (c) => c.followRequests,
  scheduled: (c) => c.scheduled,
  'instance/[domain]': (c) => c.localTimeline,
  'moderation/index': (c) => c.serverInfo,
  'moderation/[id]': (c) => c.serverInfo,
  'status-history/[id]': (c) => c.edit,
  'settings/filters/index': (c) => c.filters,
  'settings/filters/[id]': (c) => c.filters,
  'settings/server': (c) => c.serverInfo,
  'settings/announcements': (c) => c.serverInfo,
  'settings/muted': (c) => c.moderationLists,
  'settings/blocked': (c) => c.moderationLists,
  'settings/blocked-domains': (c) => c.moderationLists,
  'lists/index': (c) => c.lists,
  'lists/[id]': (c) => c.lists,
  'lists/add/[accountId]': (c) => c.lists,
  'lists/manage/[id]': (c) => c.lists,
  'saved/[kind]': (c) => c.bookmarks || c.favourites,
  'profile/edit': (c) => c.editProfile,
  trending: (c) => c.trends || c.trendingTopics,
  'feeds/index': (c) => c.feeds,
  'feeds/[id]': (c) => c.feeds,
  'feeds/info/[id]': (c) => c.feeds,
  'settings/services': (c) => c.services,
  'settings/muted-words': (c) => c.mutedWords,
  'settings/moderation-lists': (c) => c.listPurposes,
  'starter-pack/[id]': (c) => c.starterPacks,
  'starter-pack/create': (c) => c.starterPacks,
} satisfies Record<string, Requirement>;

// Every other route file. A new screen has to be added here or to the table above.
export const ALWAYS_AVAILABLE = [
  'index',
  'oauth',
  'oauth/callback',
  'sign-up',
  'login',
  'add-account',
  'open',
  'media/[statusId]',
  'compose',
  'status-menu/[id]',
  'shortcuts',
  'report/[accountId]',
  'messages',
  'messages/[id]',
  'more',
  'account/[id]',
  'follows/[id]',
  'post/[id]',
  'tag/[name]',
  'theme',
  'settings/index',
  'settings/catalog',
  'settings/reading',
  'settings/theme/[id]',
  'drafts',
  'find-follows',
] as const;

export type CapabilityScreen = keyof typeof CAPABILITY_SCREENS;

export const reachableScreens = (capabilities: BackendCapabilities) =>
  (Object.keys(CAPABILITY_SCREENS) as CapabilityScreen[]).filter((name) => CAPABILITY_SCREENS[name](capabilities));
