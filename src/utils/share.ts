import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

import { t } from '@/i18n';
import { showToast } from '@/utils/toast';

export async function copyText(text: string) {
  await Clipboard.setStringAsync(text);
  showToast(t('common.copied'));
}

export async function shareUrl(url: string) {
  try {
    await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
  } catch {
    await copyText(url);
  }
}
