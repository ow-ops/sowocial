import { useInfiniteQuery } from '@tanstack/react-query';
import { createRestAPIClient, MastoHttpError } from 'masto';

import { toPost } from '@/model/adapters/ap';

import { keys } from '../keys';
import { byMaxId, PAGE_SIZE } from '../pagination';

export function classifyInstanceError(error: unknown): 'restricted' | 'notFound' | 'other' {
  const status = error instanceof MastoHttpError ? error.statusCode : undefined;
  if (status === 401 || status === 403) return 'restricted';
  return status === 404 ? 'notFound' : 'other';
}

// Unauthenticated: the server's own public local timeline, with its own ids.
export function useInstanceTimeline(domain: string) {
  return useInfiniteQuery({
    queryKey: keys.instanceTimeline(domain),
    queryFn: async ({ pageParam }) => {
      const masto = createRestAPIClient({ url: `https://${domain}` });
      return (await masto.v1.timelines.public.list({ local: true, limit: PAGE_SIZE, maxId: pageParam })).map(toPost);
    },
    ...byMaxId,
  });
}
