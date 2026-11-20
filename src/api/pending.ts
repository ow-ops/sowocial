import { hashKey, type InfiniteData, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { createStore, useStore } from 'zustand';

import type { Page } from '@/model/page';
import type { Post } from '@/model/post';

import { mergePending } from './gaps';
import { catchUp, type LiveSource } from './timeline-source';

type PendingState = { pending: Record<string, Post[]>; overflowed: ReadonlySet<string> };

// Posts that arrived live, kept out of the query cache so the list does not jump under the reader.
// Keyed by the timeline's query key, which starts with its account.
const pendingStore = createStore<PendingState>(() => ({ pending: {}, overflowed: new Set() }));
const EMPTY: Post[] = [];

export const PENDING_LIMIT = 50;

export const getPending = (queryKey: QueryKey) => pendingStore.getState().pending[hashKey(queryKey)] ?? EMPTY;

export const markOverflowed = (queryKey: QueryKey) =>
  pendingStore.setState((s) => ({ overflowed: new Set(s.overflowed).add(hashKey(queryKey)) }));

export const setPending = (queryKey: QueryKey, posts: Post[]) =>
  pendingStore.setState((s) => ({ pending: { ...s.pending, [hashKey(queryKey)]: posts.slice(0, PENDING_LIMIT) } }));

export const usePending = (queryKey: QueryKey) => useStore(pendingStore, (s) => s.pending[hashKey(queryKey)] ?? EMPTY);

export const usePendingOverflow = (queryKey: QueryKey) => useStore(pendingStore, (s) => s.overflowed.has(hashKey(queryKey)));

// Shows the waiting posts. When they can't be merged without a hole, it catches up from the server instead.
export function showPending(queryClient: QueryClient, source: LiveSource) {
  const { queryKey } = source;
  const id = hashKey(queryKey);
  const waiting = getPending(queryKey);
  const lost = pendingStore.getState().overflowed.has(id);
  const data = queryClient.getQueryData<InfiniteData<Page<Post>>>(queryKey);
  pendingStore.setState((s) => ({
    pending: { ...s.pending, [id]: [] },
    overflowed: new Set([...s.overflowed].filter((o) => o !== id)),
  }));
  const trimmed = !!data && data.pageParams[0] !== undefined;
  if (trimmed || !source.mergesWaiting || lost || waiting.length >= PENDING_LIMIT) {
    void catchUp(queryClient, source, { silent: false });
    return;
  }
  queryClient.setQueryData<InfiniteData<Page<Post>>>(queryKey, (old) => (old ? mergePending(old, waiting) : old));
}
