import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { useIsRestoring, type InfiniteData, type Query, type QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore, type Persister } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { createStore, useStore } from 'zustand';

import { storage } from '@/utils/kv';

import { accountOf, rootOf } from './keys';
import { resetPaginators, toFirstPage } from './pagination';
import { resetPending } from './pending';

// Persisted queries must outlive the cache's default 5 minutes, and gcTime must be at least maxAge.
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
const PERSIST_SCHEMA = 4;
export const PERSIST_BUSTER = `${Constants.expoConfig?.version ?? '0'}.${PERSIST_SCHEMA}`;
const WRITE_THROTTLE = 3000;

const deleted = new Set<string>();

const accountPersister = (account: string) =>
  createAsyncStoragePersister({
    storage: {
      getItem: storage.getItem.bind(storage),
      removeItem: storage.removeItem.bind(storage),
      // The library's throttle can't be cancelled, so a queued write must not resurrect a deleted cache.
      setItem: (key, value) => (deleted.has(account) ? undefined : storage.setItem(key, value)),
    },
    key: `query-cache.${account}`,
    throttleTime: WRITE_THROTTLE,
  });

// Only the cached account's own queries are saved; a mixed timeline is filed under either of its accounts.
const belongsTo = (queryKey: readonly unknown[], account: string | undefined) =>
  !!account && (accountOf(queryKey) === account || (queryKey[2] === 'mixed' && queryKey[3] === account));

export function shouldPersist(query: Query) {
  if (query.state.status !== 'success' || !belongsTo(query.queryKey, persistedAccount)) return false;
  const root = rootOf(query.queryKey);
  const second = query.queryKey[2];
  if (root === 'timeline') {
    const data = query.state.data as InfiniteData<unknown>;
    return (second === 'home' || second === 'local' || second === 'public' || second === 'mixed') && data.pageParams[0] === undefined;
  }
  if (root === 'notifications') return (query.state.data as InfiniteData<unknown>).pageParams[0] === undefined;
  if (root === 'lists') return query.queryKey.length === 2;
  return root === 'credentials' || root === 'instance';
}

const withoutRaw = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutRaw);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([k, v]) => (k === 'raw' ? [] : [[k, withoutRaw(v)]])));
};

const persistedData = (data: unknown) =>
  data && typeof data === 'object' && 'pages' in data
    ? withoutRaw(toFirstPage(data as InfiniteData<unknown>))
    : data;

export const dehydrateOptions = { shouldDehydrateQuery: shouldPersist, serializeData: persistedData };

// Undefined during an account switch so the emptied cache is never saved over the next account's.
let current: Persister | undefined;
let persistedAccount: string | undefined;
let epoch = 0;
let resolveInitial: (account: string | null) => void = () => {};
const initial = new Promise<string | null>((resolve) => (resolveInitial = resolve));

export const persister: Persister = {
  persistClient: (client) => current?.persistClient(client),
  restoreClient: async () => {
    const account = await initial;
    current = account ? accountPersister(account) : undefined;
    persistedAccount = account ?? undefined;
    return current?.restoreClient();
  },
  removeClient: () => current?.removeClient(),
};

export function setInitialAccount(account: string | null) {
  persistedAccount = account ?? undefined;
  resolveInitial(account);
}

// True from the moment an account switch empties the cache until its persisted copy is back.
const switching = createStore<{ active: boolean }>(() => ({ active: false }));

// Effects that catch a list up must wait for this, or they run against an empty cache.
export const useCacheRestoring = () => {
  const initial = useIsRestoring();
  return useStore(switching, (s) => s.active) || initial;
};

export async function switchAccountCache(queryClient: QueryClient, account: string | null) {
  const mine = ++epoch;
  switching.setState({ active: true });
  current = undefined;
  persistedAccount = account ?? undefined;
  queryClient.clear();
  resetPaginators();
  resetPending();
  if (!account) {
    switching.setState({ active: false });
    return;
  }
  deleted.delete(account);
  const next = accountPersister(account);
  try {
    await persistQueryClientRestore({
      queryClient,
      persister: { ...next, restoreClient: async () => (mine === epoch ? next.restoreClient() : undefined) },
      maxAge: PERSIST_MAX_AGE,
      buster: PERSIST_BUSTER,
    });
  } catch {
  }
  if (mine === epoch) {
    current = next;
    switching.setState({ active: false });
  }
}

export async function deleteAccountCache(account: string) {
  deleted.add(account);
  try {
    await accountPersister(account).removeClient();
  } catch {
  }
}
