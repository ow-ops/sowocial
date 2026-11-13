import { homeSourceStore, setHomeSource } from '@/api/home-sources';
import { prefsStore } from '@/prefs/store';
import { themeStore } from '@/theme/store';
import { loadDrafts, replaceDrafts } from '@/utils/drafts';
import { keysWithPrefix } from '@/utils/kv';
import { DRAFT_PREFIX, RECENT_SEARCHES_PREFIX } from '@/utils/kv-keys';
import { loadRecentSearches, replaceRecentSearches } from '@/utils/recent-searches';

import type { Snapshot } from './backup';

const readByOwner = <T>(prefix: string, load: (owner: string) => T) =>
  Object.fromEntries(
    keysWithPrefix(prefix)
      .map((key) => key.slice(prefix.length))
      .map((owner) => [owner, load(owner)]),
  );

const writeByOwner = <T>(byOwner: Record<string, T>, replace: (owner: string, value: T) => void) => {
  for (const [owner, value] of Object.entries(byOwner)) replace(owner, value);
};

export function readSnapshot(): Snapshot {
  return {
    prefs: prefsStore.getState(),
    theme: themeStore.getState(),
    homeSource: homeSourceStore.getState().source,
    drafts: readByOwner(DRAFT_PREFIX, loadDrafts),
    recentSearches: readByOwner(RECENT_SEARCHES_PREFIX, loadRecentSearches),
  };
}

// Stores first, so the running app shows the restored values; their subscriptions persist them.
export function applySnapshot(next: Snapshot) {
  prefsStore.setState(next.prefs);
  themeStore.setState(next.theme);
  if (next.homeSource) setHomeSource(next.homeSource);
  writeByOwner(next.drafts, replaceDrafts);
  writeByOwner(next.recentSearches, replaceRecentSearches);
}
