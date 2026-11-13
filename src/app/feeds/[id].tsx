import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { feedUri } from '@/api/bsky/feed-data';
import { useFeedGenerator } from '@/api/bsky/feeds';
import { Button } from '@/components/button';
import { FeedPosts } from '@/components/feed-posts';

export default function FeedTimeline() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = feedUri(id);
  const { data: generator } = useFeedGenerator(uri);
  return (
    <>
      <Stack.Screen
        options={{
          title: generator?.view.displayName ?? t('timeline.feeds.title'),
          headerRight: () => (
            <Button
              label={t('timeline.feeds.about')}
              size="small"
              variant="outline"
              onPress={() => router.push({ pathname: '/feeds/info/[id]', params: { id } })}
            />
          ),
        }}
      />
      <FeedPosts uri={uri} />
    </>
  );
}
