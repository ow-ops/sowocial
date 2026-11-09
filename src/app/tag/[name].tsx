import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTimeline } from '@/api/timelines';
import { useSetTagFollowing, useTag } from '@/api/ap/tags';
import { Button } from '@/components/button';
import { LiveStatusList } from '@/components/status-list';
import { tapHaptic } from '@/utils/haptics';
import { showError } from '@/utils/toast';

export default function TagTimeline() {
  const { t } = useTranslation();
  const { name } = useLocalSearchParams<{ name: string }>();
  const { data: tag } = useTag(name);
  const setFollowing = useSetTagFollowing();
  return (
    <>
      <Stack.Screen
        options={{
          title: `#${name}`,
          headerRight: tag
            ? () => (
                <Button
                  label={tag.following ? t('timeline.tag.following') : t('timeline.tag.follow')}
                  accessibilityLabel={t(tag.following ? 'timeline.tag.unfollowLabel' : 'timeline.tag.followLabel', { name })}
                  variant="outline"
                  size="small"
                  role="togglebutton"
                  selected={!!tag.following}
                  onPress={() => {
                    tapHaptic();
                    setFollowing.mutate(
                      { name, follow: !tag.following },
                      { onError: (e) => showError(t(tag.following ? 'timeline.tag.unfollowError' : 'timeline.tag.followError'), e.message) },
                    );
                  }}
                />
              )
            : undefined,
        }}
      />
      <LiveStatusList
        timeline={{ tag: name }}
        query={useTimeline({ tag: name })}
        emptyText={t('timeline.tag.empty', { name })}
      />
    </>
  );
}
