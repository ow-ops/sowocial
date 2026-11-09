import { useRecyclingState } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Hairline, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';

export function FilteredStatus({ status, children }: { status: Post; children: ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [revealed, setRevealed] = useRecyclingState(false, [status.key]);
  const matches = status.filters ?? [];

  if (matches.length === 0) return children;
  if (matches.some((m) => m.action === 'hide')) return null;
  if (revealed) return children;

  const titles = matches.map((m) => m.title).join(', ');
  return (
    <Pressable
      onPress={() => setRevealed(true)}
      accessibilityRole="button"
      accessibilityLabel={t('status.filtered.label', { titles })}
      style={[styles.row, { borderBottomColor: theme.border, backgroundColor: theme.page }]}>
      <ThemedText type="meta" numberOfLines={1} style={styles.title}>
        {t('status.filtered.title', { titles })}
      </ThemedText>
      <ThemedText type="label" themeColor="primary">
        {t('status.filtered.show')}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderBottomWidth: Hairline,
  },
  title: { flex: 1 },
});
