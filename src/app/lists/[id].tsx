import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useList } from '@/api/lists';
import { Button } from '@/components/button';
import { ListPosts } from '@/components/list-posts';
import { ModerationList } from '@/components/moderation-list';

export default function ListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: list } = useList(id);
  return list?.purpose === 'mod' ? <ModerationList id={id} /> : <ListTimeline />;
}

function ListTimeline() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: list } = useList(id);
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
      <ListPosts id={id} />
    </>
  );
}
