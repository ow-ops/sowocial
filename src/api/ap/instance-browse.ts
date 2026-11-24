import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createRestAPIClient, MastoHttpError } from 'masto';

import { toPost } from '@/model/adapters/ap';
import { pageOf } from '@/model/page';

import { keys } from '../keys';
import { byPage, PAGE_SIZE, selectItems } from '../pagination';

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
      const posts = (await masto.v1.timelines.public.list({ local: true, limit: PAGE_SIZE, maxId: pageParam })).map(toPost);
      return pageOf(posts, posts.at(-1)?.cursor);
    },
    ...byPage,
    select: selectItems,
  });
}

// Unauthenticated: one post as its server shows it to visitors. GoToSocial and servers in
// secure mode refuse this.
export function usePublicPost(domain: string, id: string) {
  return useQuery({
    queryKey: keys.publicPost(domain, id),
    queryFn: async () => toPost(await createRestAPIClient({ url: `https://${domain}` }).v1.statuses.$select(id).fetch()),
    retry: false,
  });
}
