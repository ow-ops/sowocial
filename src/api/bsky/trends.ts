import { useQuery } from '@tanstack/react-query';

import { useBsky } from '../client';
import { keys } from '../keys';

const TREND_COUNT = 25;

export function useBskyTrends() {
  const agent = useBsky();
  return useQuery({
    queryKey: keys.bskyTrends,
    queryFn: async () => (await agent.app.bsky.unspecced.getTrends({ limit: TREND_COUNT })).data.trends,
  });
}
