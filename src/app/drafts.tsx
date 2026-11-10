import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { accountKey, useAuthedSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { shortRelativeTime } from '@/utils/relative-time';
import { confirmAction } from '@/utils/dialog';
import { showError } from '@/utils/toast';
import { deleteDraft, loadDrafts, sweepDraftFiles, type SavedDraft } from '@/utils/drafts';

export default function DraftsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const owner = accountKey(useAuthedSession());
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  useFocusEffect(
    useCallback(() => {
      setDrafts(loadDrafts(owner));
      sweepDraftFiles();
    }, [owner]),
  );

  const remove = (id: string) =>
    confirmAction(t('compose.drafts.discardConfirm'), t('compose.drafts.discard'), () => {
      try {
        deleteDraft(owner, id);
      } catch (error) {
        showError(t('compose.drafts.deleteFailed'), error instanceof Error ? error.message : undefined);
      }
      setDrafts(loadDrafts(owner));
    });

  return (
    <SettingsScreen title={t('common.nav.drafts')}>
      {drafts.length === 0 ? (
        <ThemedText themeColor="muted" style={styles.empty}>
          {t('compose.drafts.empty')}
        </ThemedText>
      ) : (
        <Section title={t('common.nav.drafts')}>
          {drafts.map((draft) => {
            const [first] = draft.segments;
            const title = first.text.trim() || draft.warning.trim() || t('compose.drafts.noText');
            const details = [
              shortRelativeTime(new Date(draft.updatedAt).toISOString()),
              draft.replyTo ? t('compose.drafts.reply') : draft.quote ? t('compose.drafts.quote') : null,
              draft.segments.length > 1 ? t('compose.drafts.posts', { count: draft.segments.length }) : null,
              first.media.length ? t('compose.scheduled.attachments', { count: first.media.length }) : null,
              first.poll ? t('compose.drafts.poll') : null,
            ].filter(Boolean);
            return (
              <View key={draft.id} style={styles.item}>
                <Row
                  title={title}
                  detail={details.join(' · ')}
                  chevron
                  onPress={() => router.replace({ pathname: '/compose', params: { draft: draft.id } })}
                  trailing={
                    <Button
                      label={t('compose.drafts.discard')}
                      accessibilityLabel={t('compose.drafts.discardA11y', { text: title })}
                      variant="outline"
                      size="small"
                      onPress={() => remove(draft.id)}
                    />
                  }
                />
              </View>
            );
          })}
        </Section>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: Spacing.four,
  },
  item: {
    paddingHorizontal: Spacing.three,
  },
});
