import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useFollowedTags, useSetTagFollowing } from '@/api/ap/tags';
import { ActionRow } from '@/components/action-row';
import { InfiniteList } from '@/components/infinite-list';
import { tapHaptic } from '@/utils/haptics';

export default function FollowedTags() {
  const { t } = useTranslation();
  const setFollowing = useSetTagFollowing();
  return (
    <InfiniteList
      title={t('common.nav.followedTags')}
      query={useFollowedTags()}
      keyExtractor={(tag) => tag.id}
      renderItem={(tag) => (
        <ActionRow
          title={`#${tag.name}`}
          chevron
          onPress={() => router.push({ pathname: '/tag/[name]', params: { name: tag.name } })}
          label={t('profile.followedTags.unfollow')}
          accessibilityLabel={t('profile.followedTags.unfollowA11y', { name: tag.name })}
          failedTitle={t('profile.followedTags.unfollowFailed')}
          run={(options) => {
            tapHaptic();
            setFollowing.mutate({ name: tag.name, follow: false }, options);
          }}
        />
      )}
      emptyText={t('profile.followedTags.empty')}
    />
  );
}
