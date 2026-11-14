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

// Signs the same account in again for a token with `scopes`; the new token replaces the old one.
// Resolves to the new session, or null when the user backs out or the web redirect takes over.
export function useReauthorise(scopes = SCOPES) {
  const { setSession } = useSession();
  const target = useApSession();
  return useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('No fediverse session');
      if (Platform.OS === 'web') {
        await startRedirectSignIn(target.instance, false, scopes);
        return null;
      }
      const next = await signIn(target.instance, false, scopes);
      if (!next) return null;
      // The browser may be logged in as someone else; their token must not replace this account's.
      if (accountKey(next) !== accountKey(target)) throw new Error(t('auth.errors.wrongAccount'));
      await setSession(next);
      return next;
    },
  });
}

const WITH_MODERATION = [...SCOPES, ...MODERATION_SCOPES];

export const useGrantModeration = () => useReauthorise(WITH_MODERATION);
