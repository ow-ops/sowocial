import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ActingAccount } from '@/auth/session';
import { ThreadView } from '@/components/thread-view';

export default function ThreadScreen() {
  const { t } = useTranslation();
  const { id, account } = useLocalSearchParams<{ id: string; account?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('common.nav.post') }} />
      <ActingAccount account={account}>
        <ThreadView id={id} />
      </ActingAccount>
    </>
  );
}
