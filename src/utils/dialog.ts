import { Alert, Platform } from 'react-native';

import { t } from '@/i18n';

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

type ConfirmOptions = { cancelLabel?: string; onCancel?: () => void; destructive?: boolean };

export function confirmAction(title: string, action: string, run: () => void, options: ConfirmOptions = {}) {
  const { cancelLabel = t('common.cancel'), onCancel, destructive = true } = options;
  if (Platform.OS === 'web') {
    if (window.confirm(t('common.confirmWeb', { title, action, cancel: cancelLabel }))) run();
    else onCancel?.();
    return;
  }
  Alert.alert(title, undefined, [
    { text: cancelLabel, style: 'cancel', onPress: onCancel },
    { text: action, style: destructive ? 'destructive' : 'default', onPress: run },
  ]);
}
