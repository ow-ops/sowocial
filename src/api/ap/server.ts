import { useQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';

import { detectServer, type ServerFeatures } from './server-detect';

export type { ReactionApi } from './server-detect';

// v1 is the one instance endpoint every Mastodon-compatible server answers.
export function useServerFeatures<T = ServerFeatures>(select?: (features: ServerFeatures) => T) {
  const { serverInfo } = useCapabilities();
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.serverFeatures(scope),
    queryFn: async () => detectServer(await getMasto(scope).v1.instance.fetch()),
    staleTime: Infinity,
    enabled: serverInfo,
    select,
  });
}
