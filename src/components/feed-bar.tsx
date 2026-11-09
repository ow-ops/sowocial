import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';

export function FeedBar({ title, children }: { title: string; children?: ReactNode }) {
  const theme = useTheme();
  const { gutterLeft, gutterRight } = useColumn();
  return (
    <View style={[styles.bar, { backgroundColor: theme.canvas, paddingLeft: gutterLeft, paddingRight: gutterRight }]}>
      <ThemedText type="display" role="heading" aria-level={1} numberOfLines={1} style={styles.title}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: TouchTarget + Spacing.three,
    paddingVertical: Spacing.two,
  },
  title: {
    flexShrink: 1,
  },
});
