import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useCapabilities } from '@/api/backend';
import { listSource } from '@/api/catch-up';
import { keys } from '@/api/keys';
import { useList, useListTimeline } from '@/api/lists';
import { Button } from '@/components/button';
import { StatusList } from '@/components/status-list';

export default function ListTimeline() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: list } = useList(id);
  const { paging } = useCapabilities();
  return (
    <>
      <Stack.Screen
        options={{
          title: list?.title ?? t('profile.lists.title'),
          headerRight: () => (
            <Button
              label={t('profile.lists.manage')}
              size="small"
              variant="outline"
              onPress={() => router.push({ pathname: '/lists/manage/[id]', params: { id } })}
            />
          ),
        }}
      />
      <StatusList
        query={useListTimeline(id)}
        queryKey={keys.listTimeline(id)}
        gapSource={listSource(id, paging === 'cursor')}
        emptyText={t('profile.lists.empty')}
      />
    </>
  );
}
