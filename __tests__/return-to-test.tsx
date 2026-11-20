import { act } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Slot } from 'expo-router';
import { Text } from 'react-native';

import RootLayout from '../src/app/_layout';

let mockSignedIn = false;
const mockListeners = new Set<() => void>();
const signIn = () => {
  mockSignedIn = true;
  mockListeners.forEach((notify) => notify());
};
jest.mock('@/auth/session', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    SessionProvider: ({ children }: { children: unknown }) => children,
    useSession: () => {
      const on = useSyncExternalStore(
        (notify: () => void) => {
          mockListeners.add(notify);
          return () => mockListeners.delete(notify);
        },
        () => mockSignedIn,
      );
      return { session: on ? { protocol: 'ap' } : null, sessions: [], isLoading: false };
    },
  };
});
jest.mock('@/api/persist', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return {
    PERSIST_MAX_AGE: 1000,
    PERSIST_BUSTER: 'test',
    PERSISTED_ROOTS: [],
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

const routes = {
  _layout: RootLayout,
  index: () => null,
  oauth: () => null,
  login: () => <Text>login screen</Text>,
  '(tabs)/_layout': Slot,
  '(tabs)/home': () => <Text>home screen</Text>,
  compose: () => <Text>compose screen</Text>,
};

describe('returning to the requested route after sign-in', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  beforeEach(() => {
    mockSignedIn = false;
  });

  it('opens the deep link a signed-out visitor asked for once they sign in', async () => {
    const { getPathname, getSearchParams } = await renderRouter(routes, { initialUrl: '/compose?text=hi' });
    expect(await screen.findByText('login screen')).toBeTruthy();

    await act(async () => signIn());

    expect(await screen.findByText('compose screen')).toBeTruthy();
    expect(getPathname()).toBe('/compose');
    expect(getSearchParams()).toEqual({ text: 'hi' });
  });

  it('lands on home when the visitor came straight to the login screen', async () => {
    const { getPathname } = await renderRouter(routes, { initialUrl: '/login' });
    await act(async () => signIn());

    expect(await screen.findByText('home screen')).toBeTruthy();
    expect(getPathname()).toBe('/home');
  });
});
