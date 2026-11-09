import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useFollowList } from '@/api/accounts';
import { AccountRow } from '@/components/account-row';
import { InfiniteList } from '@/components/infinite-list';

export default function FollowList() {
  const { t } = useTranslation();
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const followers = kind !== 'following';
  return (
    <InfiniteList
      title={followers ? t('profile.follows.followers') : t('profile.follows.following')}
      query={useFollowList(id, followers ? 'followers' : 'following')}
      keyExtractor={(a) => a.id}
      renderItem={(a) => <AccountRow account={a} />}
      emptyText={followers ? t('profile.follows.emptyFollowers') : t('profile.follows.emptyFollowing')}
    />
  );
}
