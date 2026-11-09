import { useQuery } from '@tanstack/react-query';
import { Link, Redirect } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { keys } from '@/api/keys';
import { loadBsky } from '@/auth/bsky-loader';
import { useSession } from '@/auth/session';
import type { BskySession } from '@/auth/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function BlueskyOAuthCallback() {
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <WebCallback />;
}

function WebCallback() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, setSession } = useSession();
  const [done, setDone] = useState(false);

  const result = useQuery({
    queryKey: keys.bskyOAuthCallback,
    queryFn: async () => (await loadBsky()).completeOAuthSignIn(),
    retry: false,
    staleTime: Infinity,
  });

  const save = useEffectEvent((data: BskySession) => setSession(data).then(() => setDone(true)));
  useEffect(() => {
    if (result.data) save(result.data);
  }, [result.data]);

  if (done || (result.data === null && session)) return <Redirect href="/home" />;
  if (result.data === null) return <Redirect href="/login" />;

  return (
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      {result.isError ? (
        <>
          <ThemedText>{result.error.message}</ThemedText>
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
