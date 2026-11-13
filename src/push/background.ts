import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { ANDROID_CHANNEL } from './config';
import { loadPushKeys } from './keys';
import { accountHash, pushMessage, unifiedPushMessage, type MastodonPush } from './payload';
import { decryptWebPush, fromBase64 } from './webpush';

// Android shows data-only pushes itself: relay pushes are decrypted here, UnifiedPush ones arrive
// decrypted. iOS decrypts in the notification service extension.
const PUSH_TASK = 'sowocial-push';

async function decryptRelayMessage(data: unknown) {
  const message = pushMessage(data);
  const keys = await loadPushKeys();
  return message && keys ? decryptWebPush(fromBase64(message), keys) : null;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data, error }) => {
  if (error || 'actionIdentifier' in data) return;
  const json = unifiedPushMessage(data.data) ?? (await decryptRelayMessage(data.data));
  if (!json) return;
  const push = JSON.parse(json) as MastodonPush;
  const account = push.access_token ? { token: push.access_token } : push.did ? { did: push.did } : null;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: push.title ?? 'sowocial',
      body: push.body ?? '',
      data: {
        accountHash: account ? accountHash(account) : undefined,
      },
    },
    trigger: { channelId: ANDROID_CHANNEL },
  });
});

if (Platform.OS === 'android') {
  Notifications.registerTaskAsync(PUSH_TASK).catch(() => {
    // Push stays off until the task can register; the app works without it.
  });
}
