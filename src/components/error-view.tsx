import type { ErrorBoundaryProps } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ErrorView({ error, retry }: Omit<ErrorBoundaryProps, 'retry'> & { retry: () => unknown }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      <ThemedText type="display">{t('timeline.errorView.title')}</ThemedText>
      <ThemedText>{error.message}</ThemedText>
      <Button label={t('common.retry')} onPress={() => void retry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
