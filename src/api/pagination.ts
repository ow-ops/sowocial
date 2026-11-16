import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import { pageCursor } from '@/model/post';

import { keys } from './keys';

export const PAGE_SIZE = 20;

export const MAX_PAGES = 6;

export const byMaxId = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { id: string; cursor?: string }[]) => {
    const item = last.at(-1);
    return item && pageCursor(item);
  },
  maxPages: MAX_PAGES,
  // A trimmed list would refetch from its middle; refreshFirstPage and streams keep it current.
  refetchOnWindowFocus: false,
};

export const byCursor = {
  ...byMaxId,
  getNextPageParam: (last: { id: string; cursor?: string }[]) => last.at(-1)?.cursor || undefined,
};

export const pagingFor = (paging: 'maxId' | 'cursor') => (paging === 'cursor' ? byCursor : byMaxId);

export const toFirstPage = (old: InfiniteData<unknown>): InfiniteData<unknown> => ({
  pages: old.pages.slice(0, 1),
  pageParams: [undefined],
});

export function refreshFirstPage(queryClient: QueryClient, queryKey: QueryKey) {
  queryClient.setQueryData<InfiniteData<unknown>>(queryKey, (old) => old && toFirstPage(old));
  return queryClient.refetchQueries({ queryKey, exact: true });
}

export function invalidateInfinite(queryClient: QueryClient, queryKey: QueryKey) {
  queryClient.setQueriesData<InfiniteData<unknown>>({ queryKey }, (old) =>
    old && typeof old === 'object' && 'pages' in old && old.pageParams[0] !== undefined ? toFirstPage(old) : old,
  );
  return queryClient.invalidateQueries({ queryKey });
}

export function invalidateFeeds(queryClient: QueryClient, account: string) {
  invalidateInfinite(queryClient, keys.timelines(account));
  invalidateInfinite(queryClient, keys.notifications(account));
}

export const paginators = new Map<string, AsyncIterator<unknown[], undefined, undefined>>();

export const resetPaginators = () => paginators.clear();
