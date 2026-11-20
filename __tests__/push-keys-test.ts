import { getOrCreatePushKeys } from '@/push/keys';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (key: string) => {
    await Promise.resolve();
    return mockStore.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    await Promise.resolve();
    mockStore.set(key, value);
  },
}));

describe('getOrCreatePushKeys', () => {
  it('hands concurrent first calls the same key pair', async () => {
    const [a, b] = await Promise.all([getOrCreatePushKeys(), getOrCreatePushKeys()]);
    expect(b.publicKey).toEqual(a.publicKey);
    expect(await getOrCreatePushKeys()).toEqual(a);
  });
});
