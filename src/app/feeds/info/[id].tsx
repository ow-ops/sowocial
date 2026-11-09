import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { feedUri, type SavedFeedAction } from '@/api/bsky/feed-data';
import { useFeedGenerator, useIsSavedFeed, useUpdateSavedFeed } from '@/api/bsky/feeds';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { Section, SettingsScreen } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { showError } from '@/utils/toast';

const FEED_AVATAR = 64;

export default function FeedInfo() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = feedUri(id);
  const { data, isPending, error, refetch } = useFeedGenerator(uri);
  const saved = useIsSavedFeed(uri);
  const update = useUpdateSavedFeed(uri);
  const run = (action: SavedFeedAction) =>
    update.mutate(action, { onError: (e) => showError(t('timeline.feeds.updateFailed'), e.message) });

  return (
    <SettingsScreen title={t('timeline.feeds.aboutTitle')}>
      <QueryState pending={isPending} error={error} onRetry={() => refetch()} />
      {data && (
        <>
          <View style={styles.header}>
            <Avatar uri={data.view.avatar ?? ''} size={FEED_AVATAR} />
            <View style={styles.title}>
              <ThemedText type="title" selectable>
                {data.view.displayName}
              </ThemedText>
              <ThemedText type="meta" selectable>
                {t('timeline.feeds.by', { handle: data.view.creator.handle })}
              </ThemedText>
            </View>
          </View>
          <Section title={t('timeline.feeds.aboutTitle')}>
            <ThemedText selectable>{data.view.description || t('timeline.feeds.noDescription')}</ThemedText>
            <ThemedText type="meta">{t('timeline.feeds.likes', { count: data.view.likeCount ?? 0 })}</ThemedText>
            {!data.isOnline && <ThemedText themeColor="danger">{t('timeline.feeds.offline')}</ThemedText>}
            {data.isOnline && !data.isValid && <ThemedText themeColor="danger">{t('timeline.feeds.invalid')}</ThemedText>}
            <Button
              label={saved ? t('timeline.feeds.remove') : t('timeline.feeds.save')}
              variant="outline"
              loading={update.isPending}
              onPress={() => run(saved ? 'remove' : 'save')}
            />
            {saved && (
              <Button
                label={saved.pinned ? t('timeline.feeds.unpin') : t('timeline.feeds.pin')}
                variant="outline"
                loading={update.isPending}
                onPress={() => run(saved.pinned ? 'unpin' : 'pin')}
              />
            )}
          </Section>
        </>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  title: {
    flex: 1,
  },
});
