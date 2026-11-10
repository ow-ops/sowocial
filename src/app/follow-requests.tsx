import { useTranslation } from 'react-i18next';

import { useFollowRequests } from '@/api/ap/profile-extras';
import { FollowRequestRow } from '@/components/follow-request-row';
import { InfiniteList } from '@/components/infinite-list';

export default function FollowRequests() {
  const { t } = useTranslation();
  return (
    <InfiniteList
      title={t('profile.followRequests.title')}
      query={useFollowRequests()}
      keyExtractor={(a) => a.id}
      renderItem={(a) => <FollowRequestRow account={a} />}
      emptyText={t('profile.followRequests.empty')}
    />
  );
}
