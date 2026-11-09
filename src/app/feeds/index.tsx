import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { feedId, type SavedFeedEntry } from '@/api/bsky/feed-data';
import { useSavedFeeds } from '@/api/bsky/feeds';
import { Avatar } from '@/components/avatar';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';

const FEED_AVATAR = 36;

function FeedRows({ entries }: { entries: SavedFeedEntry[] }) {
  const { t } = useTranslation();
  return entries.map(({ saved, view }) => (
    <Row
      key={saved.id}
      title={view.displayName}
      detail={t('timeline.feeds.by', { handle: view.creator.handle })}
      leading={<Avatar uri={view.avatar ?? ''} size={FEED_AVATAR} />}
      chevron
      onPress={() => router.push({ pathname: '/feeds/[id]', params: { id: feedId(view.uri) } })}
    />
  ));
}

export default function Feeds() {
  const { t } = useTranslation();
  const { data, isPending, error, refetch } = useSavedFeeds();
  const pinned = data?.filter((e) => e.saved.pinned) ?? [];
  const saved = data?.filter((e) => !e.saved.pinned) ?? [];
  return (
    <SettingsScreen title={t('timeline.feeds.title')}>
      {(isPending || error || data?.length === 0) && (
        <Section title={t('timeline.feeds.title')}>
          <QueryState
            pending={isPending}
            error={error}
            emptyText={t('timeline.feeds.intro')}
            onRetry={() => refetch()}
          />
        </Section>
      )}
      {pinned.length > 0 && (
        <Section title={t('timeline.feeds.pinned')}>
          <FeedRows entries={pinned} />
        </Section>
      )}
      {saved.length > 0 && (
        <Section title={t('timeline.feeds.saved')}>
          <FeedRows entries={saved} />
        </Section>
      )}
    </SettingsScreen>
  );
}
