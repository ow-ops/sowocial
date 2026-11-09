import type { mastodon } from 'masto';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useCancelScheduled, useRescheduleStatus, useScheduledStatuses } from '@/api/ap/compose';
import { Button } from '@/components/button';
import { DateTimeField } from '@/components/date-time-field';
import { InfiniteList } from '@/components/infinite-list';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/utils/dialog';

function ScheduledItem({ item }: { item: mastodon.v1.ScheduledStatus }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const cancel = useCancelScheduled();
  const reschedule = useRescheduleStatus();
  const error = cancel.error ?? reschedule.error;

  return (
    <View style={[styles.item, { backgroundColor: theme.page, borderBottomColor: theme.border }]}>
      <ThemedText numberOfLines={4}>{item.params.text}</ThemedText>
      {item.mediaAttachments.length > 0 && (
        <ThemedText type="meta">{t('compose.scheduled.attachments', { count: item.mediaAttachments.length })}</ThemedText>
      )}
      <View style={styles.actions}>
        <DateTimeField
          value={new Date(item.scheduledAt)}
          onChange={(date) => reschedule.mutate({ id: item.id, scheduledAt: date.toISOString() })}
        />
        <Button
          label={t('compose.scheduled.cancel')}
          variant="outline"
          size="small"
          loading={cancel.isPending}
          onPress={() => confirmAction(t('compose.scheduled.discardConfirm'), t('compose.scheduled.discard'), () => cancel.mutate(item.id))}
        />
      </View>
      {error && <ThemedText themeColor="danger">{error.message}</ThemedText>}
    </View>
  );
}

export default function ScheduledScreen() {
  const { t } = useTranslation();
  const query = useScheduledStatuses();
  return (
    <InfiniteList
      title={t('common.nav.scheduled')}
      query={query}
      keyExtractor={(s) => s.id}
      renderItem={(s) => <ScheduledItem item={s} />}
      emptyText={t('compose.scheduled.empty')}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderBottomWidth: Hairline,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
