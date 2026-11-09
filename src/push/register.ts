import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { mastodon } from 'masto';
import { Platform } from 'react-native';

import { t } from '@/i18n';
import { readItem, removeItem, writeItem } from '@/utils/kv';

import { ANDROID_CHANNEL, PUSH_RELAY_URL } from './config';
import { chooseDistributor } from './delivery';
import { getOrCreatePushKeys } from './keys';
import { tokenHash } from './payload';
import { unifiedPush, type UnifiedPushEndpoint } from './unified-push';
import { base64url } from './webpush';

type SubscriptionParams = Parameters<mastodon.rest.Client['v1']['push']['subscription']['create']>[0];

const ALERTS = {
  mention: true,
  status: true,
  reblog: true,
  follow: true,
  followRequest: true,
  favourite: true,
  poll: true,
  update: true,
};

// Set when the user picks the relay on a phone that has a UnifiedPush distributor.
const RELAY_PREFERRED_KEY = 'push.relay';
const REGISTRATION_TIMEOUT_MS = 15_000;

// The endpoint and keys the server holds for an account delivering through UnifiedPush.
const subscribedKey = (instance: string) => `push.up.${instance}`;

export function pushDistributors() {
  return unifiedPush?.getDistributors() ?? [];
}

// The distributor pushes go through, or null for the relay.
export function activeDistributor() {
  if (!unifiedPush || readItem(RELAY_PREFERRED_KEY)) return null;
  return chooseDistributor(
    pushDistributors().map((d) => d.id),
    unifiedPush.getSavedDistributor(),
  );
}

export function chooseDelivery(distributor: string | null) {
  if (!unifiedPush) return;
  if (distributor) {
    removeItem(RELAY_PREFERRED_KEY);
    unifiedPush.saveDistributor(distributor);
  } else {
    writeItem(RELAY_PREFERRED_KEY, '1');
  }
}

// Another app may have subscribed with this token; only ours goes through the relay or the saved endpoint.
export function isOurSubscription(endpoint: string, accountToken: string) {
  if (endpoint.startsWith(PUSH_RELAY_URL)) return true;
  const saved = readItem(subscribedKey(tokenHash(accountToken)));
  return !!saved && (JSON.parse(saved) as { url: string }).url === endpoint;
}

function params(endpoint: string, p256dh: string, auth: string) {
  // `standard` makes Mastodon 4.4+ use RFC 8291, the only encoding the relay and app accept.
  // masto's types omit it and put `policy` at the top level instead of under `data`, so fill both.
  return {
    subscription: { endpoint, keys: { p256dh, auth }, standard: true },
    data: { alerts: ALERTS, policy: 'all' },
    policy: 'all',
  } as SubscriptionParams;
}

const endpointRecord = ({ url, pubKey, auth }: UnifiedPushEndpoint) => JSON.stringify({ url, pubKey, auth });

function registerEndpoint(distributor: string, instance: string, vapid: string | null) {
  const native = unifiedPush!;
  return new Promise<UnifiedPushEndpoint>((resolve, reject) => {
    const subscriptions = [
      native.addListener('endpoint', (endpoint) => {
        if (endpoint.instance === instance) settle(() => resolve(endpoint));
      }),
      native.addListener('registrationFailed', (failure) => {
        if (failure.instance === instance) {
          settle(() => reject(new Error(t('notifications.push.registrationFailed', { reason: failure.reason }))));
        }
      }),
    ];
    const timer = setTimeout(
      () => settle(() => reject(new Error(t('notifications.push.distributorSilent')))),
      REGISTRATION_TIMEOUT_MS,
    );
    const settle = (finish: () => void) => {
      clearTimeout(timer);
      subscriptions.forEach((subscription) => subscription.remove());
      finish();
    };
    // The connector only registers with the saved distributor, and the default pick was never saved.
    native.saveDistributor(distributor);
    native.register(instance, vapid);
  });
}

async function subscribeUnifiedPush(masto: mastodon.rest.Client, instance: string, endpoint: UnifiedPushEndpoint) {
  const subscription = await masto.v1.push.subscription.create(params(endpoint.url, endpoint.pubKey, endpoint.auth));
  writeItem(subscribedKey(instance), endpointRecord(endpoint));
  return subscription;
}

async function vapidKey(masto: mastodon.rest.Client) {
  const instance = await masto.v2.instance.fetch();
  return instance.configuration.vapid?.publicKey ?? null;
}

// The server encrypts to our keys and posts to the relay, which forwards the ciphertext to APNs or FCM.
// With a UnifiedPush distributor, the server posts straight to the distributor's endpoint instead.
export async function enablePush(masto: mastodon.rest.Client, accountToken: string) {
  if (Platform.OS === 'android') {
    // Android 13+ shows no permission prompt and issues no token until a channel exists.
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: t('notifications.push.channel'),
      importance: AndroidImportance.HIGH,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error(t('notifications.push.permissionDenied'));

  const instance = tokenHash(accountToken);
  const distributor = activeDistributor();
  if (distributor) {
    const endpoint = await registerEndpoint(distributor, instance, await vapidKey(masto));
    return await subscribeUnifiedPush(masto, instance, endpoint);
  }
  removeItem(subscribedKey(instance));

  const keys = await getOrCreatePushKeys();
  return await masto.v1.push.subscription.create(
    params(await relayEndpoint(), base64url(keys.publicKey), base64url(keys.auth)),
  );
}

async function relayEndpoint() {
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  // Development-signed iOS builds get APNs sandbox tokens, which production APNs rejects.
  const platform =
    Platform.OS === 'ios' && (await Application.getIosPushNotificationServiceEnvironmentAsync()) === 'development'
      ? 'ios-sandbox'
      : Platform.OS;
  return `${PUSH_RELAY_URL}/push/${platform}/${encodeURIComponent(String(token))}`;
}

export async function disablePush(masto: mastodon.rest.Client, accountToken: string) {
  const instance = tokenHash(accountToken);
  if (readItem(subscribedKey(instance))) {
    unifiedPush?.unregister(instance);
    removeItem(subscribedKey(instance));
  }
  await masto.v1.push.subscription.remove();
}

// Runs at app start: a distributor can hand out a new endpoint or disappear between runs, and
// APNs or FCM can issue a new device token.
export async function syncPush(masto: mastodon.rest.Client, accountToken: string) {
  const instance = tokenHash(accountToken);
  const saved = readItem(subscribedKey(instance));
  const distributor = activeDistributor();
  if (saved && distributor) {
    const endpoint = await registerEndpoint(distributor, instance, await vapidKey(masto));
    if (endpointRecord(endpoint) !== saved) await subscribeUnifiedPush(masto, instance, endpoint);
    return;
  }
  if (saved) {
    await enablePush(masto, accountToken);
    return;
  }
  const current = await masto.v1.push.subscription.fetch().catch(() => null);
  if (current?.endpoint.startsWith(PUSH_RELAY_URL) && current.endpoint !== (await relayEndpoint())) {
    await enablePush(masto, accountToken);
  }
}
