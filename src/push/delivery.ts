import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '@/i18n';

import { ANDROID_CHANNEL, PUSH_RELAY_URL } from './config';
import { activeDistributor, forgetSavedEndpoint, registerEndpoint, saveEndpoint } from './distributor';
import { getOrCreatePushKeys } from './keys';
import { base64url } from './webpush';

export type Delivery = { endpoint: string; p256dh: string; auth: string };
type Registration = { delivery: Delivery; remember(): void };

export async function allowNotifications() {
  if (Platform.OS === 'android') {
    // Android 13+ shows no permission prompt and issues no token until a channel exists.
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: t('notifications.push.channel'),
      importance: AndroidImportance.HIGH,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error(t('notifications.push.permissionDenied'));
}

export async function relayEndpoint() {
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  // Development-signed iOS builds get APNs sandbox tokens, which production APNs rejects.
  const platform =
    Platform.OS === 'ios' && (await Application.getIosPushNotificationServiceEnvironmentAsync()) === 'development'
      ? 'ios-sandbox'
      : Platform.OS;
  return `${PUSH_RELAY_URL}/push/${platform}/${encodeURIComponent(String(token))}`;
}

// Where a server should post an account's pushes: the distributor's endpoint, or the relay with this device's keys.
// `remember` saves the distributor's endpoint, once the server has accepted it.
export async function deliveryFor(instance: string, vapid?: () => Promise<string | null>): Promise<Registration> {
  const distributor = activeDistributor();
  if (distributor) {
    const endpoint = await registerEndpoint(distributor, instance, (await vapid?.()) ?? null);
    return {
      delivery: { endpoint: endpoint.url, p256dh: endpoint.pubKey, auth: endpoint.auth },
      remember: () => saveEndpoint(instance, endpoint),
    };
  }
  forgetSavedEndpoint(instance);

  const keys = await getOrCreatePushKeys();
  const delivery = { endpoint: await relayEndpoint(), p256dh: base64url(keys.publicKey), auth: base64url(keys.auth) };
  return { delivery, remember: () => {} };
}
