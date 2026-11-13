import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { loadBsky } from '@/auth/bsky-loader';
import { oauthAvailable } from '@/auth/bsky-oauth-config';
import { MODERATION_SCOPES, SCOPES, signIn, startRedirectSignIn } from '@/auth/oauth';
import { accountKey, useApSession, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { t } from '@/i18n';

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

// Re-authorises the same server with the moderation scopes added; the new token replaces the old one.
export function useGrantModeration() {
  const { setSession } = useSession();
  const target = useApSession();
  return useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('No fediverse session');
      const scopes = [...SCOPES, ...MODERATION_SCOPES];
      if (Platform.OS === 'web') return startRedirectSignIn(target.instance, false, scopes);
      const next = await signIn(target.instance, false, scopes);
      if (!next) return;
      // The browser may be logged in as someone else; their token must not replace this account's.
      if (accountKey(next) !== accountKey(target)) throw new Error(t('moderation.wrongAccount'));
      await setSession(next);
    },
  });
}
