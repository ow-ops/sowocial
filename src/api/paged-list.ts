import { useInfiniteQuery } from '@tanstack/react-query';

import { paginators } from './pagination';

export function usePagedList<T, R = T>(
  queryKey: readonly unknown[],
  create: () => AsyncIterable<T[]>,
  convert?: (item: T) => R,
  enabled = true,
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      // The key starts with its account, so two accounts never share an iterator.
      const id = JSON.stringify(queryKey);
      let iterator = paginators.get(id);
      if (pageParam === 0 || !iterator) {
        // No iterator for a later page (cache restored or cleared): replay up to it.
        iterator = create()[Symbol.asyncIterator]();
        paginators.set(id, iterator);
        for (let skipped = 0; skipped < pageParam; skipped++) await iterator.next();
      }
      const page = await iterator.next();
      if (page.done) return [];
      return convert ? (page.value as T[]).map(convert) : (page.value as unknown as R[]);
    },
    initialPageParam: 0,
    enabled,
    getNextPageParam: (last: R[], pages) => (last.length > 0 ? pages.length : undefined),
  });
}
