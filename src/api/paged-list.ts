import { useInfiniteQuery } from '@tanstack/react-query';

type Cursor = { iterator: AsyncIterator<unknown[], undefined, undefined>; position: number };

// Keyed by query key, which starts with its account, so two accounts never share an iterator.
const cursors = new Map<string, Cursor>();

export async function nextPage(queryKey: readonly unknown[], create: () => AsyncIterable<unknown[]>, index: number) {
  const id = JSON.stringify(queryKey);
  let cursor = cursors.get(id);
  // An iterator that is not at the wanted page (first load, refetch, restored cache) is rebuilt and replayed to it.
  if (cursor?.position !== index) {
    cursor = { iterator: create()[Symbol.asyncIterator](), position: 0 };
    cursors.set(id, cursor);
    for (; cursor.position < index; cursor.position++) await cursor.iterator.next();
  }
  const page = await cursor.iterator.next();
  cursor.position++;
  return page.done ? [] : page.value;
}

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
      const page = await nextPage(queryKey, create, pageParam);
      return convert ? (page as T[]).map(convert) : (page as unknown as R[]);
    },
    initialPageParam: 0,
    enabled,
    getNextPageParam: (last: R[], pages) => (last.length > 0 ? pages.length : undefined),
  });
}
