import { Link, Redirect, type Href } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  // The session the redirect handed back, once the code exchange has finished.
  data: Session | null | undefined;
  // The error shown in place of the spinner, from the exchange or from the redirect itself.
  error: string | undefined;
  // True when there is no sign-in to complete; signed-in users go home, others to `signedOutHref` if given.
  idle: boolean;
  signedOutHref?: Href;
};

export function OAuthCallback({ data, error, idle, signedOutHref }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, setSession } = useSession();
  const [done, setDone] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The account being added may be signed in next to existing ones, so `session` cannot gate this.
  const save = useEffectEvent((next: Session) =>
    setSession(next).then(
      () => setDone(true),
      (e) => setSaveError(e instanceof Error ? e.message : String(e)),
    ),
  );
  useEffect(() => {
    if (data) save(data);
  }, [data]);

  if (done || (idle && session)) return <Redirect href="/home" />;
  if (idle && signedOutHref) return <Redirect href={signedOutHref} />;

  const message = error ?? saveError;
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
