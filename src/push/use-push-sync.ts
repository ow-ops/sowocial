import { useEffect, useEffectEvent } from 'react';

import { useSession } from '@/auth/session';

import { pushOperations } from './operations';

export function usePushSync(enabled: boolean) {
  const { session } = useSession();
  const credential = session && pushOperations(session).credential;

  const sync = useEffectEvent(() => {
    if (!session) return;
    pushOperations(session)
      .sync()
      .catch(() => {
        // The server or relay keeps the last registration; the next start tries again.
      });
  });

  useEffect(() => {
    if (enabled && credential) sync();
  }, [enabled, credential]);
}
