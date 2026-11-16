import { useQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';

export function useInstance() {
  const { serverInfo } = useCapabilities();
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.instance(scope),
    queryFn: () => getMasto(scope).v2.instance.fetch(),
    staleTime: Infinity,
    enabled: serverInfo,
  });
}
