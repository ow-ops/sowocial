import { format } from 'date-fns';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useStatusHistory } from '@/api/statuses';
import { Section, SettingsScreen } from '@/components/settings';
import { StatusContent } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale } from '@/i18n';
import { htmlContent } from '@/model/content';

export default function StatusHistoryScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('common.nav.editHistory') }} />
      <StatusHistory id={id} />
    </>
  );
}

function StatusHistory({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data, isError, error } = useStatusHistory(id);

  if (isError) return <ThemedText themeColor="danger" style={styles.message}>{error.message}</ThemedText>;
  if (!data) return <ActivityIndicator color={theme.muted} style={styles.message} />;

  const revisions = [...data].reverse();

  return (
    <SettingsScreen>
      {revisions.map((revision, i) => {
        const title =
          i === 0
            ? t('timeline.statusHistory.current')
            : i === revisions.length - 1
              ? t('timeline.statusHistory.original')
              : t('timeline.statusHistory.revision', { number: revisions.length - i });
        return (
          <Section key={`${revision.createdAt}-${i}`} title={title}>
            <ThemedText type="meta">{format(new Date(revision.createdAt), t('timeline.statusHistory.dateFormat'), { locale: dateLocale() })}</ThemedText>
            <View style={[styles.revision, { borderColor: theme.border }]}>
              {revision.spoilerText ? <ThemedText type="label">{revision.spoilerText}</ThemedText> : null}
              <StatusContent content={htmlContent(revision.content, revision.emojis)} />
              {revision.mediaAttachments.length > 0 && (
                <ThemedText type="meta">
                  {t('timeline.statusHistory.attachments', { count: revision.mediaAttachments.length })}
                </ThemedText>
              )}
            </View>
          </Section>
        );
      })}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  message: { padding: Spacing.four, textAlign: 'center' },
  revision: {
    gap: Spacing.two,
    padding: Spacing.three,
    ...Outlined,
  },
});
