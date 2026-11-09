import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { createStore, useStore } from 'zustand';

import type { Post } from '@/model/post';

import { keys, type Timeline } from './keys';
import { refreshFirstPage } from './pagination';

type PendingState = { pending: Record<string, Post[]>; overflowed: ReadonlySet<string> };

// Posts that arrived live, kept out of the query cache so the list does not jump under the reader.
const initial = (): PendingState => ({ pending: {}, overflowed: new Set() });
const pendingStore = createStore<PendingState>(initial);
const EMPTY: Post[] = [];

export const PENDING_LIMIT = 50;

export const idOf = (timeline: Timeline) => keys.timeline(timeline)[1];

export const getPending = (id: string) => pendingStore.getState().pending[id] ?? EMPTY;

export const markOverflowed = (id: string) =>
  pendingStore.setState((s) => ({ overflowed: new Set(s.overflowed).add(id) }));

export const setPending = (id: string, statuses: Post[]) =>
  pendingStore.setState((s) => ({ pending: { ...s.pending, [id]: statuses.slice(0, PENDING_LIMIT) } }));

export const resetPending = () => pendingStore.setState(initial());

export const usePendingById = (id: string) => useStore(pendingStore, (s) => s.pending[id] ?? EMPTY);

export const usePendingStatuses = (timeline: Timeline) => usePendingById(idOf(timeline));

export const usePendingOverflow = (timeline: Timeline) => {
  const id = idOf(timeline);
  return useStore(pendingStore, (s) => s.overflowed.has(id));
};

// Puts the waiting posts on top of the first page, skipping any a refetch already brought in.
export function mergePending(data: InfiniteData<Post[]>, waiting: Post[]): InfiniteData<Post[]> {
  const cached = new Set(data.pages.flat().map((s) => s.key));
  const fresh = waiting.filter((s) => !cached.has(s.key));
  const [first = [], ...rest] = data.pages;
  return { ...data, pages: [[...fresh, ...first], ...rest] };
}

export function showPending(queryClient: QueryClient, timeline: Timeline) {
  const id = idOf(timeline);
  const waiting = getPending(id);
  const key = keys.timeline(timeline);
  const data = queryClient.getQueryData<InfiniteData<Post[]>>(key);
  const lost = pendingStore.getState().overflowed.has(id);
  pendingStore.setState((s) => ({
    pending: { ...s.pending, [id]: [] },
    overflowed: new Set([...s.overflowed].filter((o) => o !== id)),
  }));
  // A full buffer or trimmed list can't be merged without a hole: refetch.
  if (lost || waiting.length >= PENDING_LIMIT || (data && data.pageParams[0] !== undefined)) {
    void refreshFirstPage(queryClient, key);
    return;
  }
  queryClient.setQueryData<InfiniteData<Post[]>>(key, (old) => (old ? mergePending(old, waiting) : old));
}
