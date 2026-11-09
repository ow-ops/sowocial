import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { mastodon } from 'masto';
import { Platform } from 'react-native';

import { t } from '@/i18n';

import { ANDROID_CHANNEL, PUSH_RELAY_URL } from './config';
import { getOrCreatePushKeys } from './keys';
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

// Subscribes this device: the server encrypts to our keys and posts to the relay,
// which hands the ciphertext to Expo's push service for this device's token.
export async function enablePush(masto: mastodon.rest.Client) {
  if (Platform.OS === 'android') {
    // Android 13+ needs a channel before a token can be issued.
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: t('notifications.push.channel'),
      importance: AndroidImportance.HIGH,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error(t('notifications.push.permissionDenied'));

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error(t('notifications.push.noProjectId'));
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  const keys = await getOrCreatePushKeys();
  const endpoint = `${PUSH_RELAY_URL}/push/${Platform.OS}/${encodeURIComponent(token)}`;
  // `standard` asks Mastodon 4.4+ for RFC 8291 (aes128gcm), the only encoding the relay
  // and app accept; GoToSocial always uses it. masto's types omit the field and put
  // `policy` at the top level, so both places are filled.
  const params = {
    subscription: { endpoint, keys: { p256dh: base64url(keys.publicKey), auth: base64url(keys.auth) }, standard: true },
    data: { alerts: ALERTS, policy: 'all' },
    policy: 'all',
  } as SubscriptionParams;
  return await masto.v1.push.subscription.create(params);
}

export async function disablePush(masto: mastodon.rest.Client) {
  await masto.v1.push.subscription.remove();
}
