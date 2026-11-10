import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDismissAnnouncement, useReactToAnnouncement } from '@/api/ap/announcements';
import { ReactionChips } from '@/components/reaction-chips';
import { StatusContent } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Press, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Announcement } from '@/model/announcement';
import { shortRelativeTime } from '@/utils/relative-time';

export function AnnouncementCard({ announcement, dismissible }: { announcement: Announcement; dismissible?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const dismiss = useDismissAnnouncement();
  const react = useReactToAnnouncement();
  const { id, content, reactions, publishedAt } = announcement;

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <ThemedText type="meta">{t('announcements.published', { when: shortRelativeTime(publishedAt) })}</ThemedText>
      <StatusContent content={content} />
      {reactions.length > 0 && (
        <ReactionChips reactions={reactions} onToggle={({ name, me }) => react.mutate({ id, name, on: !me })} />
      )}
      {dismissible && (
        <Pressable
          onPress={() => dismiss.mutate({ id })}
          accessibilityRole="button"
          accessibilityLabel={t('announcements.dismiss')}
          hitSlop={6}
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: Press.opacity }]}>
          <ThemedText type="label" themeColor="primary">
            {t('announcements.dismiss')}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...Outlined,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  dismiss: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
  },
});
