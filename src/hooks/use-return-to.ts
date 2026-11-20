import { useUnstableGlobalHref, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { clearReturnTo, rememberReturnTo, returnTo } from '@/auth/return-to';

// A signed-out visitor is sent to /login. Returns where the login screen should send them
// once signed in: the route they asked for, or home.
// Signing out from inside the app is not remembered: that route may belong to the old account.
export function useReturnTo(ready: boolean, signedIn: boolean): Href {
  const href = useUnstableGlobalHref();
  const hadSession = useRef(false);
  const target = signedIn ? returnTo() : null;

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) {
      if (!hadSession.current) rememberReturnTo(href);
      return;
    }
    hadSession.current = true;
    clearReturnTo();
  }, [ready, signedIn, href]);

  return (target ?? '/home') as Href;
}
