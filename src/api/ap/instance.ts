import { useQuery } from '@tanstack/react-query';

import { useForeignAccount } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys, scoped } from '../keys';

export function useInstance() {
  const { serverInfo } = useCapabilities();
  const scope = useForeignAccount();
  return useQuery({
    queryKey: scoped(keys.instance, scope),
    queryFn: () => getMasto(scope).v2.instance.fetch(),
    staleTime: Infinity,
    enabled: serverInfo,
  });
}
