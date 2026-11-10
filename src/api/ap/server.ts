import { useQuery } from '@tanstack/react-query';

import { useForeignAccount } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys, scoped } from '../keys';

import { detectServer } from './server-detect';

export type { ReactionApi } from './server-detect';

// v1 is the one instance endpoint every Mastodon-compatible server answers.
export function useServerFeatures() {
  const { serverInfo } = useCapabilities();
  const scope = useForeignAccount();
  return useQuery({
    queryKey: scoped(keys.serverFeatures, scope),
    queryFn: async () => detectServer(await getMasto(scope).v1.instance.fetch()),
    staleTime: Infinity,
    enabled: serverInfo,
  });
}
