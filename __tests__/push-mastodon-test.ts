import { disablePush, enablePush, isOurSubscription, syncPush } from '@/push/mastodon';
import { tokenHash } from '@/push/payload';

const mockKv = new Map<string, string>();

jest.mock('@/utils/kv', () => ({
  readItem: (key: string) => mockKv.get(key) ?? null,
  writeItem: (key: string, value: string) => void mockKv.set(key, value),
  removeItem: (key: string) => void mockKv.delete(key),
}));
jest.mock('expo-application', () => ({ getIosPushNotificationServiceEnvironmentAsync: async () => 'production' }));
jest.mock('expo-notifications', () => ({
  AndroidImportance: {},
  requestPermissionsAsync: async () => ({ granted: true }),
  getDevicePushTokenAsync: async () => ({ data: 'device-token' }),
}));
jest.mock('@/push/config', () => ({ ANDROID_CHANNEL: 'push', PUSH_RELAY_URL: 'https://relay.test' }));
jest.mock('@/push/keys', () => ({
  getOrCreatePushKeys: async () => ({ publicKey: new Uint8Array([1]), auth: new Uint8Array([2]) }),
}));
jest.mock('@/i18n', () => ({ t: (key: string) => key }));

type Listener = (payload: never) => void;
let mockNative: ReturnType<typeof fakeNative> | null = null;
jest.mock('@/push/unified-push', () => ({
  get unifiedPush() {
    return mockNative;
  },
}));

function fakeNative(url: string) {
  const listeners = new Map<string, Listener>();
  return {
    getDistributors: () => [{ id: 'ntfy', name: 'ntfy' }],
    getSavedDistributor: () => 'ntfy',
    saveDistributor: jest.fn(),
    unregister: jest.fn(),
    addListener: (event: string, listener: Listener) => {
      listeners.set(event, listener);
      return { remove: () => void listeners.delete(event) };
    },
    register: jest.fn((instance: string) => {
      listeners.get('endpoint')?.({ instance, url, pubKey: 'pub', auth: 'auth' } as never);
    }),
  };
}

const token = 'secret';
const instance = tokenHash(token);
const relayDevice = 'https://relay.test/push/ios/device-token';

const masto = {
  v1: { push: { subscription: { create: jest.fn(), remove: jest.fn(), fetch: jest.fn() } } },
  v2: { instance: { fetch: jest.fn() } },
};
const client = masto as never;
const created = () => masto.v1.push.subscription.create.mock.calls.map(([args]) => args.subscription.endpoint);

beforeEach(() => {
  mockKv.clear();
  mockNative = null;
  jest.resetAllMocks();
  masto.v2.instance.fetch.mockResolvedValue({ configuration: { vapid: { publicKey: 'vapid' } } });
  masto.v1.push.subscription.fetch.mockRejectedValue(new Error('404'));
});

describe('Mastodon push through the relay', () => {
  it('subscribes the server to this device on the relay', async () => {
    await enablePush(client, token);
    expect(masto.v1.push.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: expect.objectContaining({ endpoint: relayDevice, keys: { p256dh: 'AQ', auth: 'Ag' } }) }),
    );
    expect(mockKv.size).toBe(0);
  });

  it('removes the server subscription on disable', async () => {
    await disablePush(client, token);
    expect(masto.v1.push.subscription.remove).toHaveBeenCalled();
  });

  it('leaves a subscription alone while the device token is unchanged', async () => {
    masto.v1.push.subscription.fetch.mockResolvedValue({ endpoint: relayDevice });
    await syncPush(client, token);
    expect(created()).toEqual([]);
  });

  it('subscribes again when the device token changed', async () => {
    masto.v1.push.subscription.fetch.mockResolvedValue({ endpoint: 'https://relay.test/push/ios/old-token' });
    await syncPush(client, token);
    expect(created()).toEqual([relayDevice]);
  });

  it('ignores another app\'s subscription', async () => {
    masto.v1.push.subscription.fetch.mockResolvedValue({ endpoint: 'https://other.test/push' });
    await syncPush(client, token);
    expect(created()).toEqual([]);
    expect(isOurSubscription('https://other.test/push', token)).toBe(false);
  });
});

describe('Mastodon push through a UnifiedPush distributor', () => {
  const endpoint = 'https://ntfy.test/up1';

  beforeEach(() => {
    mockNative = fakeNative(endpoint);
  });

  it('subscribes the server to the distributor endpoint and remembers it', async () => {
    await enablePush(client, token);
    expect(mockNative!.register).toHaveBeenCalledWith(instance, 'vapid');
    expect(created()).toEqual([endpoint]);
    expect(isOurSubscription(endpoint, token)).toBe(true);
  });

  it('does not remember the endpoint when the server refuses it', async () => {
    masto.v1.push.subscription.create.mockRejectedValue(new Error('422'));
    await expect(enablePush(client, token)).rejects.toThrow();
    expect(isOurSubscription(endpoint, token)).toBe(false);
  });

  it('unregisters from the distributor on disable', async () => {
    await enablePush(client, token);
    await disablePush(client, token);
    expect(mockNative!.unregister).toHaveBeenCalledWith(instance);
    expect(isOurSubscription(endpoint, token)).toBe(false);
  });

  it('keeps the subscription when the distributor hands out the same endpoint', async () => {
    await enablePush(client, token);
    masto.v1.push.subscription.create.mockClear();
    await syncPush(client, token);
    expect(created()).toEqual([]);
  });

  it('subscribes the new endpoint when the distributor hands out another', async () => {
    await enablePush(client, token);
    masto.v1.push.subscription.create.mockClear();
    mockNative = fakeNative('https://ntfy.test/up2');
    await syncPush(client, token);
    expect(created()).toEqual(['https://ntfy.test/up2']);
  });

  it('falls back to the relay when the distributor is gone', async () => {
    await enablePush(client, token);
    masto.v1.push.subscription.create.mockClear();
    mockNative = null;
    await syncPush(client, token);
    expect(created()).toEqual([relayDevice]);
    expect(isOurSubscription(endpoint, token)).toBe(false);
  });
});
