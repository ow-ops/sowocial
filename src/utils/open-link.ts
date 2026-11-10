import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { t } from '@/i18n';
import { getPref } from '@/prefs/store';
import { showError } from '@/utils/toast';

export async function openLink(url: string) {
  try {
    const web = /^https?:/i.test(url);
    if (web && (Platform.OS === 'web' || getPref('links') === 'inApp')) await WebBrowser.openBrowserAsync(url);
    else await Linking.openURL(url);
  } catch (error) {
    showError(t('common.linkFailed'), error instanceof Error ? error.message : undefined);
  }
}
