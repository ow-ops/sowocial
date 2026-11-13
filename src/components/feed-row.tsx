import { router } from 'expo-router';
import type { AppBskyFeedDefs } from '@atproto/api';
import { useTranslation } from 'react-i18next';

import { feedId } from '@/api/bsky/feed-data';
import { Avatar } from '@/components/avatar';
import { Row } from '@/components/settings';

const FEED_AVATAR = 36;

export function FeedRow({ view, pathname }: { view: AppBskyFeedDefs.GeneratorView; pathname: '/feeds/[id]' | '/feeds/info/[id]' }) {
  const { t } = useTranslation();
  return (
    <Row
      title={view.displayName}
      detail={t('timeline.feeds.by', { handle: view.creator.handle })}
      leading={<Avatar uri={view.avatar ?? ''} size={FEED_AVATAR} />}
      chevron
      onPress={() => router.push({ pathname, params: { id: feedId(view.uri) } })}
    />
  );
}
