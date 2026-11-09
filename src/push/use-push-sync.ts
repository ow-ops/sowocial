import { createRestAPIClient } from 'masto';
import { useEffect } from 'react';

import { useSession } from '@/auth/session';

import { syncPush } from './register';

export function usePushSync(enabled: boolean) {
  const { session } = useSession();
  const instance = session?.protocol === 'ap' ? session.instance : undefined;
  const token = session?.protocol === 'ap' ? session.token : undefined;

  useEffect(() => {
    if (!enabled || !instance || !token) return;
    syncPush(createRestAPIClient({ url: instance, accessToken: token }), token).catch(() => {
      // The server keeps the last subscription; the next start tries again.
    });
  }, [enabled, instance, token]);
}
