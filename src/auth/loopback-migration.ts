import { ACTIVE_KEY, INDEX_KEY, LEGACY_KEY } from './account-key';
import { DRAFT_PREFIX, HOME_SOURCE_KEY, MIXED_EXPLAINED_KEY, PREFS_KEY, THEME_KEY } from '@/utils/kv-keys';

export const MIGRATE_PARAM = 'sowocial-migrate';

export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
type Entries = Record<string, string>;

const FIXED_KEYS = [INDEX_KEY, ACTIVE_KEY, LEGACY_KEY, THEME_KEY, PREFS_KEY, HOME_SOURCE_KEY, MIXED_EXPLAINED_KEY];

const parseJson = (raw: string | null): unknown => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const indexKeys = (raw: string | null) => {
  const parsed = parseJson(raw);
  return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
};

const isDraft = (key: string) => key.startsWith(DRAFT_PREFIX);

// Spreading a whole payload into one call overflows the argument limit.
const SPREAD_LIMIT = 0x8000;

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += SPREAD_LIMIT) binary += String.fromCharCode(...bytes.subarray(i, i + SPREAD_LIMIT));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (encoded: string) => {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

export function buildMigrationFragment(store: Store): string | null {
  const keys = [...FIXED_KEYS, ...indexKeys(store.getItem(INDEX_KEY))];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && isDraft(key)) keys.push(key);
  }
  const entries: Entries = {};
  for (const key of keys) {
    const value = store.getItem(key);
    if (value !== null) entries[key] = value;
  }
  if (!entries[INDEX_KEY]) return null;
  return `#${MIGRATE_PARAM}=${toBase64Url(JSON.stringify({ v: 1, entries }))}`;
}

export function parseMigrationFragment(hash: string): Entries | null {
  const prefix = `#${MIGRATE_PARAM}=`;
  if (!hash.startsWith(prefix)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(hash.slice(prefix.length)));
    if (payload?.v !== 1 || !payload.entries || typeof payload.entries !== 'object') return null;
    const entries: Entries = {};
    for (const [key, value] of Object.entries(payload.entries)) if (typeof value === 'string') entries[key] = value;
    return entries;
  } catch {
    return null;
  }
}

export function mergeMigration(store: Store, entries: Entries) {
  const existing = indexKeys(store.getItem(INDEX_KEY));
  const incoming = indexKeys(entries[INDEX_KEY] ?? null);
  const added = incoming.filter((key) => !existing.includes(key) && typeof entries[key] === 'string');
  for (const key of added) store.setItem(key, entries[key]);
  if (added.length) store.setItem(INDEX_KEY, JSON.stringify([...existing, ...added]));

  const merged = [...existing, ...added];
  const active = store.getItem(ACTIVE_KEY);
  if ((!active || !merged.includes(active)) && entries[ACTIVE_KEY] && merged.includes(entries[ACTIVE_KEY])) {
    store.setItem(ACTIVE_KEY, entries[ACTIVE_KEY]);
  }

  const optional = [LEGACY_KEY, THEME_KEY, HOME_SOURCE_KEY, MIXED_EXPLAINED_KEY, ...Object.keys(entries).filter(isDraft)];
  for (const key of optional) {
    if (typeof entries[key] === 'string' && store.getItem(key) === null) store.setItem(key, entries[key]);
  }
}
