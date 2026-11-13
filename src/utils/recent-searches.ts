import { create } from 'zustand';

import { accountKey, getActiveSession, useSession } from '@/auth/session';
import { readItem, removeItem, writeItem } from '@/utils/kv';
import { RECENT_SEARCHES_PREFIX } from '@/utils/kv-keys';

const MAX_RECENT = 8;

const recentStore = create<{ lists: Record<string, string[]> }>(() => ({ lists: {} }));

const keyFor = (session: Parameters<typeof accountKey>[0] | null) =>
  session ? `${RECENT_SEARCHES_PREFIX}${accountKey(session)}` : null;

function read(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

const current = (key: string) => recentStore.getState().lists[key] ?? read(key);

function commit(key: string, next: string[]) {
  recentStore.setState((state) => ({ lists: { ...state.lists, [key]: next } }));
  if (next.length) writeItem(key, JSON.stringify(next));
  else removeItem(key);
}

export const loadRecentSearches = (owner: string) => read(`${RECENT_SEARCHES_PREFIX}${owner}`);

export const replaceRecentSearches = (owner: string, queries: string[]) => commit(`${RECENT_SEARCHES_PREFIX}${owner}`, queries);

export function rememberSearch(query: string) {
  const key = keyFor(getActiveSession());
  if (key) commit(key, [query, ...current(key).filter((item) => item !== query)].slice(0, MAX_RECENT));
}

export function useRecentSearches() {
  const key = keyFor(useSession().session);
  const stored = recentStore((state) => (key ? state.lists[key] : undefined));
  const items = stored ?? (key ? read(key) : []);

  return {
    items,
    remove: (query: string) => {
      if (key) commit(key, current(key).filter((item) => item !== query));
    },
    clear: () => {
      if (key) commit(key, []);
    },
  };
}
