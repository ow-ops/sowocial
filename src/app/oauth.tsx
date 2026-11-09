import { useQuery } from '@tanstack/react-query';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { keys } from '@/api/keys';
import { completeRedirectSignIn } from '@/auth/oauth';
import { useSession } from '@/auth/session';
import type { ApSession } from '@/auth/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function OAuthCallback() {
  // Native sign-in already got the code from the auth session; Android also delivers
  // the redirect as a deep link, which lands here.
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <WebCallback />;
}

function WebCallback() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, setSession } = useSession();
  const [done, setDone] = useState(false);
  const { code = '', state = '', error } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
  }>();

  // useQuery dedupes, so the single-use code is exchanged once even under StrictMode.
  const result = useQuery({
    queryKey: keys.oauthCallback(code, state),
    queryFn: () => completeRedirectSignIn(code, state),
    enabled: !!code,
    retry: false,
    staleTime: Infinity,
  });

  // The account being added may be signed in next to existing ones, so `session` cannot gate this.
  const save = useEffectEvent((data: ApSession) => setSession(data).then(() => setDone(true)));
  useEffect(() => {
    if (result.data) save(result.data);
  }, [result.data]);

  if (done || (!code && session)) return <Redirect href="/home" />;

  const message = error ?? (result.isError ? result.error.message : null);
  return (
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      {message ? (
        <>
          <ThemedText>{message}</ThemedText>
          <Link href="/login">
            <ThemedText type="label" themeColor="primary">
              {t('auth.oauth.backToSignIn')}
            </ThemedText>
          </Link>
        </>
      ) : (
        <ActivityIndicator color={theme.muted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
