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

export function usePushSubscription() {
  const { push } = useCapabilities();
  return useQuery({
    queryKey: keys.pushSubscription,
    // Servers answer 404 when this token has no subscription.
    queryFn: () => getMasto().v1.push.subscription.fetch().catch(() => null),
    enabled: push,
  });
}
