import { completeRedirectSignIn } from '@/auth/oauth';

const mockStore = new Map<string, string>();

jest.mock('@/auth/storage', () => ({
  getItem: async (key: string) => mockStore.get(key) ?? null,
  setItem: async (key: string, value: string) => void mockStore.set(key, value),
  removeItem: async (key: string) => void mockStore.delete(key),
}));
jest.mock('expo-auth-session', () => ({}));
jest.mock('masto', () => ({}));
jest.mock('@/auth/instance', () => ({}));
jest.mock('@/i18n', () => ({ t: (key: string) => key }));

describe('completeRedirectSignIn', () => {
  it('keeps the pending sign-in when the callback state is wrong', async () => {
    mockStore.set('pending-oauth', JSON.stringify({ state: 'right' }));
    await expect(completeRedirectSignIn('code', 'wrong')).rejects.toThrow('auth.errors.notVerified');
    expect(mockStore.has('pending-oauth')).toBe(true);
  });

  it('reports an expired link when nothing is pending', async () => {
    mockStore.clear();
    await expect(completeRedirectSignIn('code', 'any')).rejects.toThrow('auth.errors.linkExpired');
  });
});
