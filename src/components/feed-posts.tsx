import { useTranslation } from 'react-i18next';

import { useFeedTimeline } from '@/api/bsky/feeds';
import { keys } from '@/api/keys';
import { useAccountScope } from '@/auth/session';
import { StatusList } from '@/components/status-list';

export function FeedPosts({ uri }: { uri: string }) {
  const { t } = useTranslation();
  const account = useAccountScope();
  return (
    <StatusList query={useFeedTimeline(uri)} queryKey={keys.feedTimeline(account, uri)} emptyText={t('timeline.feeds.empty')} />
  );
}
