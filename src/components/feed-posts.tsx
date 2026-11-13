import { useTranslation } from 'react-i18next';

import { useFeedTimeline } from '@/api/bsky/feeds';
import { keys } from '@/api/keys';
import { StatusList } from '@/components/status-list';

export function FeedPosts({ uri }: { uri: string }) {
  const { t } = useTranslation();
  return (
    <StatusList query={useFeedTimeline(uri)} queryKey={keys.feedTimeline(uri)} emptyText={t('timeline.feeds.empty')} />
  );
}
