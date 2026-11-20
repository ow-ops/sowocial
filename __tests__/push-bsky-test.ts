import { accountHash } from '@/push/payload';
import { disablePushBsky, enablePushBsky, isBskyPushOn, syncPushBsky } from '@/push/bluesky';

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
jest.mock('@/push/unified-push', () => ({ unifiedPush: null }));
jest.mock('@/push/keys', () => ({
  getOrCreatePushKeys: async () => ({ publicKey: new Uint8Array([1]), auth: new Uint8Array([2]) }),
}));
jest.mock('@/i18n', () => ({ t: (key: string) => key }));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

const did = 'did:plc:me';
const delivery = { endpoint: 'https://relay.test/push/ios/device-token', p256dh: 'AQ', auth: 'Ag' };

beforeEach(() => {
  mockKv.clear();
  fetchMock.mockReset();
  mockKv.set(`push.bsky.${accountHash({ did })}`, JSON.stringify(delivery));
});

const methods = () => fetchMock.mock.calls.map(([, init]) => init.method);

describe('Bluesky push', () => {
  it('registers this device with the relay on enable', async () => {
    mockKv.clear();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    await enablePushBsky(did);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://relay.test/bsky/subscriptions');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ did, ...delivery });
    expect(isBskyPushOn(did)).toBe(true);
  });

  it('stays off when the relay refuses the registration', async () => {
    mockKv.clear();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(enablePushBsky(did)).rejects.toThrow();
    expect(isBskyPushOn(did)).toBe(false);
  });

  it('does nothing on sync when push is off', async () => {
    mockKv.clear();
    await syncPushBsky(did);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns push off locally when the relay already forgot the registration', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    await disablePushBsky(did);
    expect(methods()).toEqual(['DELETE']);
    expect(isBskyPushOn(did)).toBe(false);
  });

  it('keeps push on when the relay fails to delete', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(disablePushBsky(did)).rejects.toThrow();
    expect(isBskyPushOn(did)).toBe(true);
  });

  it('registers again on every sync, even when the delivery is unchanged', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await syncPushBsky(did);
    await syncPushBsky(did);
    expect(methods()).toEqual(['PUT', 'PUT']);
  });
});
