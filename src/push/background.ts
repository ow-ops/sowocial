import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { ANDROID_CHANNEL } from './config';
import { loadPushKeys } from './keys';
import { pushMessage, tokenHash, type MastodonPush } from './payload';
import { decryptWebPush, fromBase64 } from './webpush';

// Android receives data-only pushes and shows them itself after decrypting; iOS decrypts
// in the notification service extension instead. Defined at module scope so the task
// exists when the system starts the app headless for a push.
const PUSH_TASK = 'sowocial-push';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data, error }) => {
  if (error || 'actionIdentifier' in data) return;
  const message = pushMessage(data.data);
  const keys = await loadPushKeys();
  if (!message || !keys) return;
  const push = JSON.parse(decryptWebPush(fromBase64(message), keys)) as MastodonPush;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: push.title ?? 'sowocial',
      body: push.body ?? '',
      data: {
        notificationId: push.notification_id ? String(push.notification_id) : undefined,
        accountHash: push.access_token ? tokenHash(push.access_token) : undefined,
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
