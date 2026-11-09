import { useMutation } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isOAuthCancelled } from '@/auth/bsky-errors';
import { loadBsky } from '@/auth/bsky-loader';
import { oauthAvailable } from '@/auth/bsky-oauth-config';
import { signIn, startRedirectSignIn } from '@/auth/oauth';
import { useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { handlesError } from '@/api/mutation-meta';

export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session: active, setSession } = useSession();
  const adding = !!active;
  const [kind, setKind] = useState<'ap' | 'bsky'>('ap');
  const [inputs, setInputs] = useState({ ap: '', bsky: '' });
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [customServer, setCustomServer] = useState(false);
  const bsky = kind === 'bsky';
  const instance = inputs[kind];
  const setInstance = (value: string) => setInputs((current) => ({ ...current, [kind]: value }));
  const [usePassword, setUsePassword] = useState(false);
  const oauthOk = oauthAvailable(Platform.OS, Platform.OS === 'web' ? window.location : undefined);
  const passwordMode = bsky && (usePassword || !oauthOk);

  const login = useMutation({
    meta: handlesError,
    mutationFn: async (input: string) => {
      if (bsky) {
        const { signInWithAppPassword, signInWithOAuth } = await loadBsky();
        const session = passwordMode
          ? await signInWithAppPassword(input, password, customServer ? server : undefined)
          : await signInWithOAuth(input).catch((error: unknown) => {
              if (isOAuthCancelled(error)) return null;
              throw error;
            });
        if (!session) return;
        await setSession(session);
        if (adding) router.dismissTo('/home');
        return;
      }
      if (Platform.OS === 'web') return startRedirectSignIn(input, adding);
      const session = await signIn(input, adding);
      if (!session) return;
      await setSession(session);
      if (adding) router.dismissTo('/home');
    },
  });

  const ready = !!instance.trim() && (!passwordMode || !!password.trim());
  const submit = () => {
    if (ready) login.mutate(instance);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.page }]}>
      {adding && <Stack.Screen options={{ title: t('common.nav.addAccount') }} />}
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.content}>
        <ThemedText type="wordmark">
          sowocial
        </ThemedText>

        <View style={styles.network}>
          <SegmentedControl
            label={t('auth.login.kind')}
            options={[
              { value: 'ap', label: t('auth.login.fediverse') },
              { value: 'bsky', label: t('auth.login.bluesky') },
            ]}
            value={kind}
            onChange={(next) => {
              setKind(next);
              login.reset();
            }}
          />
        </View>

        <View style={styles.intro}>
          <ThemedText type="title">
            {t(bsky ? 'auth.login.blueskyHeadline' : 'auth.login.headline')}
          </ThemedText>
          <ThemedText>
            {bsky ? t(passwordMode ? 'auth.login.blueskyPasswordIntro' : 'auth.login.blueskyIntro') : t('auth.login.intro')}
          </ThemedText>
        </View>

        <View style={styles.form}>
          <TextField
            value={instance}
            onChangeText={setInstance}
            onSubmitEditing={submit}
            placeholder={t(bsky ? 'auth.login.handlePlaceholder' : 'auth.login.placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={bsky ? 'email-address' : 'url'}
            returnKeyType={passwordMode ? 'next' : 'go'}
            editable={!login.isPending}
            accessibilityLabel={t(bsky ? (passwordMode ? 'auth.login.handleLabel' : 'auth.login.handleOrServerLabel') : 'auth.login.serverAddress')}
          />
          {passwordMode && (
            <TextField
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder={t('auth.login.passwordPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="go"
              editable={!login.isPending}
              accessibilityLabel={t('auth.login.passwordLabel')}
              />
          )}
          {passwordMode &&
            (customServer ? (
              <TextField
                value={server}
                onChangeText={setServer}
                onSubmitEditing={submit}
                placeholder={t('auth.login.serverPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                editable={!login.isPending}
                accessibilityLabel={t('auth.login.serverLabel')}
              />
            ) : (
              <Button
                label={t('auth.login.customServer')}
                variant="outline"
                size="small"
                onPress={() => setCustomServer(true)}
              />
            ))}
          {login.isError && <ThemedText themeColor="danger">{login.error.message}</ThemedText>}
          <Button
            label={t('auth.login.continue')}
            onPress={submit}
            disabled={!ready}
            loading={login.isPending}
          />
          {bsky && oauthOk && (
            <Button
              label={t(usePassword ? 'auth.login.useOAuth' : 'auth.login.usePassword')}
              variant="outline"
              size="small"
              disabled={login.isPending}
              onPress={() => {
                setUsePassword(!usePassword);
                login.reset();
              }}
            />
          )}
        </View>

        <ThemedText type="meta" style={styles.footer}>
          {t('auth.login.footer')}
        </ThemedText>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  network: {
    marginTop: Spacing.five,
  },
  intro: {
    marginTop: Spacing.four,
    gap: Spacing.three,
  },
  form: {
    marginTop: Spacing.five,
    gap: Spacing.three,
  },
  footer: {
    marginTop: 'auto',
  },
});
