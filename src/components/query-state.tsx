import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isUnsupported } from '@/api/ap/unsupported';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  pending: boolean;
  error: Error | null;
  emptyText?: string;
  pendingLabel?: string;
  onRetry?: () => void;
};

export function QueryState({ pending, error, emptyText, pendingLabel, onRetry }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (pending) return <ActivityIndicator color={theme.muted} accessibilityLabel={pendingLabel} />;
  if (isUnsupported(error)) return <ThemedText themeColor="muted">{t('common.unavailable')}</ThemedText>;
  if (error) {
    return (
      <View style={styles.error}>
        <ThemedText themeColor="danger">{error.message}</ThemedText>
        {onRetry && <Button label={t('common.retry')} variant="outline" size="small" onPress={onRetry} />}
      </View>
    );
  }
  return emptyText ? <ThemedText themeColor="muted">{emptyText}</ThemedText> : null;
}

const styles = StyleSheet.create({
  error: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
