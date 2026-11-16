import { useQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { useBsky } from '../client';
import { keys } from '../keys';

const TREND_COUNT = 25;

export function useBskyTrends() {
  const agent = useBsky();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyTrends(account),
    queryFn: async () => (await agent.app.bsky.unspecced.getTrends({ limit: TREND_COUNT })).data.trends,
  });
}
