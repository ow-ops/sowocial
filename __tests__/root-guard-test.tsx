import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '../src/app/_layout';

jest.mock('@/auth/session', () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: () => ({ session: null, sessions: [], isLoading: false }),
}));
jest.mock('@/api/persist', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return {
    PERSIST_MAX_AGE: 1000,
    PERSIST_BUSTER: 'test',
    dehydrateOptions: {},
    persister: { persistClient: jest.fn(), restoreClient: jest.fn(async () => undefined), removeClient: jest.fn() },
    QueryClient,
  };
});
jest.mock('@expo-google-fonts/bricolage-grotesque', () => ({
  BricolageGrotesque_600SemiBold: 1,
  BricolageGrotesque_700Bold: 1,
  useFonts: () => [true],
}));
jest.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: jest.fn() }) }));
jest.mock('@/push/background', () => ({}));
jest.mock('@/hooks/use-outbox', () => ({ useOutbox: jest.fn() }));
jest.mock('@/push/use-push-sync', () => ({ usePushSync: jest.fn() }));
jest.mock('@/push/use-push-taps', () => ({ usePushTaps: jest.fn() }));
jest.mock('@/share/use-share-intent', () => ({ useShareToCompose: jest.fn() }));
jest.mock('@/shortcuts/shortcuts-host', () => ({ ShortcutsHost: () => null }));
jest.mock('@/components/link-resolving-pill', () => ({ LinkResolvingPill: () => null }));
jest.mock('@/components/overlay-host', () => ({ OverlayHost: () => null }));
jest.mock('@/components/toaster', () => ({ AppToaster: () => null }));
jest.mock('@/utils/toast', () => ({ showError: jest.fn(), showToast: jest.fn() }));
jest.mock('@/components/reconnect-banner', () => ({ ReconnectBanner: () => null }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardProvider: ({ children }: { children: unknown }) => children }));
jest.mock('expo-share-intent', () => ({ ShareIntentProvider: ({ children }: { children: unknown }) => children }));

describe('root guard', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('redirects a signed-out visitor from a protected route to /login', async () => {
    const { getPathname } = await renderRouter(
      {
        _layout: RootLayout,
        index: () => null,
        oauth: () => null,
        login: () => <Text>login screen</Text>,
        '(tabs)/_layout': () => null,
        '(tabs)/home': () => <Text>home screen</Text>,
      },
      { initialUrl: '/home' },
    );
    expect(await screen.findByText('login screen')).toBeTruthy();
    expect(getPathname()).toBe('/login');
    expect(screen.queryByText('home screen')).toBeNull();
  });
});
