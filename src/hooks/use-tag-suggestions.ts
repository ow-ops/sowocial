import { useCapabilities } from '@/api/backend';
import { useFollowedTags } from '@/api/ap/tags';
import { useTrendingTags, useTrendsAvailable } from '@/api/ap/trends';

export type TagSuggestion = { name: string; uses?: number };

export function useTagSuggestions() {
  const { trends, tags } = useCapabilities();
  const availability = useTrendsAvailable();
  const settled = !trends || !availability.isPending;
  const trending = trends && availability.data === true;
  const trendingQuery = useTrendingTags(trending);
  const trendingTags = trendingQuery.data?.pages.flat() ?? [];
  const trendingEmpty = trendingQuery.isSuccess && trendingTags.length === 0;
  const fallback = tags && settled && (!trending || trendingEmpty || trendingQuery.isError);
  const followedQuery = useFollowedTags(fallback);

  if (fallback) {
    return {
      kind: 'followed' as const,
      items: (followedQuery.data?.pages.flat() ?? []).map((tag): TagSuggestion => ({ name: tag.name })),
      pending: followedQuery.isPending,
      error: followedQuery.error,
      retry: () => void followedQuery.refetch(),
    };
  }
  return {
    kind: trending ? ('trending' as const) : null,
    items: trendingTags.map(
      (tag): TagSuggestion => ({
        name: tag.name,
        uses: tag.history?.reduce((sum, day) => sum + Number(day.uses), 0) ?? 0,
      }),
    ),
    pending: !settled || (trending && trendingQuery.isPending),
    error: trendingQuery.error,
    retry: () => void trendingQuery.refetch(),
  };
}
