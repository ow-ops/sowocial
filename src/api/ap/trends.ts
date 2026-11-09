import { useQuery } from '@tanstack/react-query';

import { toPost } from '@/model/adapters/ap';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { PAGE_SIZE } from '../pagination';
import { usePagedList } from '../paged-list';
import { isUnsupported } from './unsupported';

const HOUR = 60 * 60 * 1000;

export function useTrendsAvailable() {
  const { trends } = useCapabilities();
  return useQuery({
    queryKey: keys.trendsAvailable,
    queryFn: async () => {
      try {
        const [statuses, tags] = await Promise.all([
          getMasto().v1.trends.statuses.list({ limit: 1 }),
          getMasto().v1.trends.tags.list({ limit: 1 }),
        ]);
        return statuses.length > 0 || tags.length > 0;
      } catch (error) {
        if (isUnsupported(error)) return false;
        throw error;
      }
    },
    staleTime: HOUR,
    enabled: trends,
  });
}

export function useTrendingStatuses() {
  const { trends } = useCapabilities();
  return usePagedList(keys.trending('statuses'), () => getMasto().v1.trends.statuses.list({ limit: PAGE_SIZE }), toPost, trends);
}

export function useTrendingTags(enabled = true) {
  const { trends } = useCapabilities();
  return usePagedList(keys.trending('tags'), () => getMasto().v1.trends.tags.list({ limit: PAGE_SIZE }), undefined, trends && enabled);
}

export function useTrendingLinks() {
  const { trends } = useCapabilities();
  return usePagedList(keys.trending('links'), () => getMasto().v1.trends.links.list({ limit: PAGE_SIZE }), undefined, trends);
}
