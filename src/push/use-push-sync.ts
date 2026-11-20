import { useEffect, useEffectEvent } from 'react';

import { useSession } from '@/auth/session';

import { pushOperations } from './operations';

export function usePushSync(enabled: boolean) {
  const { sessions } = useSession();
  const credentials = sessions.map((s) => pushOperations(s).credential).join();

  const sync = useEffectEvent(() => {
    for (const session of sessions) {
      pushOperations(session)
        .sync()
        .catch(() => {
          // The server or relay keeps the last registration; the next start tries again.
        });
    }
  });

  useEffect(() => {
    if (enabled && credentials) sync();
  }, [enabled, credentials]);
}
