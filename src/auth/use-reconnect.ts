import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { loadBsky } from '@/auth/bsky-loader';
import { oauthAvailable } from '@/auth/bsky-oauth-config';
import { signIn, startRedirectSignIn } from '@/auth/oauth';
import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';

export function useReconnect() {
  const { session: active, setSession, switchAccount } = useSession();
  return useMutation({
    mutationFn: async (target: Session) => {
      if (target.protocol === 'ap') {
        if (Platform.OS === 'web') return startRedirectSignIn(target.instance);
        const next = await signIn(target.instance);
        if (next) await setSession(next);
        return;
      }
      if (!oauthAvailable(Platform.OS, Platform.OS === 'web' ? window.location : undefined)) return router.push('/add-account');
      await setSession(await (await loadBsky()).signInWithOAuth(target.handle));
      if (active && accountKey(active) !== accountKey(target)) await switchAccount(active);
    },
  });
}
