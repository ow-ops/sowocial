import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useColumn } from '@/hooks/use-column';
import { useStackOptions } from '@/hooks/use-stack-options';

export default function ProfileLayout() {
  const { t } = useTranslation();
  const { web } = useColumn();
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ headerShown: !web, title: t('timeline.tabs.profile') }} />
    </Stack>
  );
}
