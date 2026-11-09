// Where fediverse servers send this device's Web Push; see push-relay/.
export const PUSH_RELAY_URL = 'https://push.sowocial.example';

// Shared with the iOS notification service extension (targets/push), which reads the
// keys from the app's keychain group: keep these names in sync with NotificationService.swift.
export const PUSH_KEYCHAIN_SERVICE = 'sowocial.push';
export const PUSH_KEYS_KEY = 'push-keys';

export const ANDROID_CHANNEL = 'notifications';
