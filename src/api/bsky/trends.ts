import { useQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { getAgent } from '../clients';
import { keys } from '../keys';

const TREND_COUNT = 25;

export function useBskyTrends() {
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyTrends(account),
    queryFn: async () => (await getAgent(account).app.bsky.unspecced.getTrends({ limit: TREND_COUNT })).data.trends,
  });
}
