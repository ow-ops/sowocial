import { useRouter } from 'expo-router';

import { accountKey, useActingKey, useSession } from '@/auth/session';

export function useOpenAccount() {
  const router = useRouter();
  const acting = useActingKey();
  const { session } = useSession();
  const active = session ? accountKey(session) : null;
  return (id: string, owner?: string) => {
    const account = owner ?? acting;
    if (account && account !== active) router.push({ pathname: '/account/[id]', params: { id, account } });
    else router.push({ pathname: '/account/[id]', params: { id } });
  };
}
