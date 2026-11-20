import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import { MastoHttpError } from 'masto';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { activate, createAccount, resendConfirmation } from '@/auth/sign-up';
import { useSignUp } from '@/hooks/use-sign-up';
import { showError, showToast } from '@/utils/toast';

const mockSetSession = jest.fn();

jest.mock('masto', () => ({
  MastoHttpError: class extends Error {
    statusCode: number;
    details: unknown;
    constructor({ statusCode, message, details }: { statusCode: number; message: string; details?: unknown }) {
      super(message);
      this.statusCode = statusCode;
      this.details = details;
    }
  },
}));
jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn() } }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/auth/session', () => ({ useSession: () => ({ setSession: mockSetSession }) }));
jest.mock('@/auth/sign-up', () => ({ activate: jest.fn(), createAccount: jest.fn(), resendConfirmation: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showError: jest.fn(), showToast: jest.fn() }));

const account = { instance: 'https://example.social', token: 't', clientId: 'c', clientSecret: 's' };
const session = { protocol: 'ap', instance: account.instance, token: 't', accountId: '1', acct: 'me' } as never;
const form = { instance: account.instance, params: { username: 'me', email: 'me@example.org', password: 'pw' } };

const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(createAccount).mockResolvedValue(account);
});

describe('useSignUp', () => {
  it('signs in and goes home when the new account is already active', async () => {
    jest.mocked(activate).mockResolvedValue(session);
    const { result } = await renderHook(() => useSignUp(), { wrapper });
    await act(async () => result.current.register.mutateAsync(form));
    expect(mockSetSession).toHaveBeenCalledWith(session);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });

  it('waits for email confirmation when the server refuses the token', async () => {
    jest.mocked(activate).mockResolvedValue(null);
    const { result } = await renderHook(() => useSignUp(), { wrapper });
    await act(async () => result.current.register.mutateAsync(form));
    expect(result.current.pending).toEqual(account);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('keeps the account and says to continue later when activation fails', async () => {
    jest.mocked(activate).mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useSignUp(), { wrapper });
    await act(async () => result.current.register.mutateAsync(form));
    expect(result.current.pending).toEqual(account);
    expect(showError).toHaveBeenCalledWith('auth.signUp.continueLater', 'offline');
  });

  it('maps the server field errors of a refused registration', async () => {
    const details = { email: [{ error: 'ERR_TAKEN', description: 'taken' }] };
    jest.mocked(createAccount).mockRejectedValue(new MastoHttpError({ statusCode: 422, message: 'bad', details } as never));
    const { result } = await renderHook(() => useSignUp(), { wrapper });
    await act(async () => result.current.register.mutateAsync(form).catch(() => {}));
    expect(result.current.errors.email?.description).toBe('taken');
    expect(result.current.pending).toBeNull();
  });

  it('sends the user to the web form when the server has no sign-up API', async () => {
    jest.mocked(createAccount).mockRejectedValue(new MastoHttpError({ statusCode: 404, message: 'nope' } as never));
    const { result } = await renderHook(() => useSignUp(), { wrapper });
    await act(async () => result.current.register.mutateAsync(form).catch(() => {}));
    expect(result.current.needsWeb).toBe(true);
  });

  it('tells the user the account is not active yet when checking too early', async () => {
    jest.mocked(activate).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const { result } = await renderHook(() => useSignUp(), { wrapper });
    await act(async () => result.current.register.mutateAsync(form));
    await act(async () => result.current.check.mutateAsync());
    expect(showToast).toHaveBeenCalledWith('auth.signUp.notYet');
  });

  it('resends the confirmation for the pending account', async () => {
    jest.mocked(activate).mockResolvedValue(null);
    const { result } = await renderHook(() => useSignUp(), { wrapper });
    await act(async () => result.current.register.mutateAsync(form));
    await act(async () => result.current.resend.mutateAsync());
    expect(resendConfirmation).toHaveBeenCalledWith(account);
    expect(showToast).toHaveBeenCalledWith('auth.signUp.resent');
  });
});
