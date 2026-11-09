import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useColumn } from '@/hooks/use-column';
import { useStackOptions } from '@/hooks/use-stack-options';

export default function SearchLayout() {
  const { t } = useTranslation();
  const { wide, web } = useColumn();
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ headerShown: !web, title: t('timeline.tabs.search'), headerLargeTitleEnabled: !wide }} />
    </Stack>
  );
}
