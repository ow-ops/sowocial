import { Alert, Platform } from 'react-native';

import { t } from '@/i18n';

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export function confirmAction(title: string, action: string, run: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(title)) run();
    return;
  }
  Alert.alert(title, undefined, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: action, style: 'destructive', onPress: run },
  ]);
}
