import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { findSession } from '@/auth/session';
import { SettingsScreen } from '@/components/settings';
import { sessionHandle } from '@/components/source-badge';
import { ThemeSlot } from '@/components/theme-slot';
import { ThemedText } from '@/components/themed-text';

export default function AccountThemeScreen() {
  const { t } = useTranslation();
  const { account = '' } = useLocalSearchParams<{ account: string }>();
  const session = findSession(account);
  if (!session) return <Redirect href="/settings" />;

  return (
    <SettingsScreen title={t('settings.accountTheme.title', { handle: sessionHandle(session) })}>
      <ThemedText type="meta">{t('settings.accountTheme.hint')}</ThemedText>
      <ThemeSlot kind="light" account={account} />
      <ThemeSlot kind="dark" account={account} />
    </SettingsScreen>
  );
}
