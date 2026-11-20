import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ShareIntentProvider } from 'expo-share-intent';

import '@/i18n';

import { capabilitiesFor } from '@/api/backend/capabilities';
import { CAPABILITY_SCREENS, type CapabilityScreen } from '@/api/backend/screens';
import { dehydrateOptions, persister, PERSIST_BUSTER, PERSIST_MAX_AGE } from '@/api/persist';
import { queryClient } from '@/api/app-query-client';
import { handOffToLoopback, receiveLoopbackHandoff } from '@/auth/loopback-handoff';
import { SessionProvider, useSession } from '@/auth/session';
import { ErrorView } from '@/components/error-view';
import { OverlayHost } from '@/components/overlay-host';
import { AppToaster } from '@/components/toaster';
import { LinkResolvingPill } from '@/components/link-resolving-pill';
import { ReconnectBanner } from '@/components/reconnect-banner';
import { useOutbox } from '@/hooks/use-outbox';
import { useReturnTo } from '@/hooks/use-return-to';
import { useCatalogThemeSync } from '@/hooks/use-theme-catalog';
import { useStackOptions } from '@/hooks/use-stack-options';
import { usePushSync } from '@/push/use-push-sync';
import { usePushTaps } from '@/push/use-push-taps';
import { useShareToCompose } from '@/share/use-share-intent';
import { ShortcutsHost } from '@/shortcuts/shortcuts-host';
import { useScheme, useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = { anchor: '(tabs)' };

export { ErrorView as ErrorBoundary };

const loopbackHref = Platform.OS === 'web' ? handOffToLoopback(window.location) : null;
if (loopbackHref) window.location.replace(loopbackHref);
else if (Platform.OS === 'web') receiveLoopbackHandoff();

const webFonts = Platform.OS === 'web' ? { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } : {};

export default function RootLayout() {
  const theme = useTheme();
  const scheme = useScheme();
  const base = scheme === 'light' ? DefaultTheme : DarkTheme;

  // The root view shows behind screens during transitions and the keyboard.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.page);
  }, [theme.page]);
  const navigationTheme: Theme = {
    ...base,
    colors: {
      primary: theme.primary,
      background: theme.page,
      card: theme.page,
      text: theme.heading,
      border: theme.border,
      notification: theme.primary,
    },
  };

  return (
    <ShareIntentProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.page }}>
        <KeyboardProvider>
          <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: PERSIST_BUSTER, dehydrateOptions }}>
            <SessionProvider>
              <ThemeProvider value={navigationTheme}>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                <RootStack />
                <LinkResolvingPill />
                <ReconnectBanner />
                <OverlayHost />
                <AppToaster />
                <ShortcutsHost />
              </ThemeProvider>
            </SessionProvider>
          </PersistQueryClientProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

function RootStack() {
  const { session, isLoading } = useSession();
  const [fontsLoaded, fontError] = useFonts(webFonts);
  const screenOptions = useStackOptions();
  const capabilities = session && capabilitiesFor(session.protocol);
  const ready = !isLoading && (fontsLoaded || !!fontError);
  usePushTaps(ready && !!session);
  usePushSync(ready && !!session);
  useOutbox(ready && !!session);
  useShareToCompose(ready && !!session);
  useCatalogThemeSync();
  const afterSignIn = useReturnTo(ready, !!session);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="oauth" options={{ headerShown: false }} />
      <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" />
      <Stack.Protected guard={!session} redirectTo={afterSignIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session} redirectTo="/login">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="open" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen
          name="media/[statusId]"
          options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }}
        />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="status-menu/[id]"
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }}
        />
        <Stack.Screen name="shortcuts" options={{ presentation: 'modal' }} />
        <Stack.Screen name="report/[accountId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="messages" />
        <Stack.Screen name="messages/[id]" />
        <Stack.Screen name="more" />
        <Stack.Screen name="drafts" />
        <Stack.Screen name="find-follows" />
        {(Object.keys(CAPABILITY_SCREENS) as CapabilityScreen[]).map((name) => (
          <Stack.Protected key={name} guard={!!capabilities && CAPABILITY_SCREENS[name](capabilities)} redirectTo="/home">
            <Stack.Screen name={name} />
          </Stack.Protected>
        ))}
      </Stack.Protected>
    </Stack>
  );
}
