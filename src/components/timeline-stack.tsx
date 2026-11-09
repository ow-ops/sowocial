import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { ComposeButton } from '@/components/compose-button';
import { ListDetail } from '@/components/list-detail';
import { useColumn } from '@/hooks/use-column';
import { useStackOptions } from '@/hooks/use-stack-options';

export function TimelineStack({ timeline }: { timeline: 'home' | 'local' }) {
  const { t } = useTranslation();
  const { wide, web } = useColumn();
  return (
    <ListDetail>
      <Stack screenOptions={useStackOptions()}>
        <Stack.Screen
          name="index"
          options={{
            headerShown: !web,
            title: t(`timeline.tabs.${timeline}`),
            headerLargeTitleEnabled: !wide,
            headerRight: Platform.OS === 'ios' ? () => <ComposeButton /> : undefined,
          }}
        />
      </Stack>
    </ListDetail>
  );
}
