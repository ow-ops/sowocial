import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { Page } from '@/model/page';

import { keys } from './keys';

export const PAGE_SIZE = 20;

export const MAX_PAGES = 6;

export const byPage = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: Page<unknown>) => last.next,
  maxPages: MAX_PAGES,
  // A trimmed list would refetch from its middle; refreshFirstPage and streams keep it current.
  refetchOnWindowFocus: false,
};

export const selectItems = <T>(data: InfiniteData<Page<T, unknown>>): InfiniteData<T[]> => ({
  ...data,
  pages: data.pages.map((page) => page.items),
});

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
