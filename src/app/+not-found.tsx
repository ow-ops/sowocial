import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function NotFound() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: t('timeline.notFound.title') }} />
      <View style={[styles.container, { backgroundColor: theme.page }]}>
        <ThemedText type="display">{t('timeline.notFound.message')}</ThemedText>
        <Link href="/">
          <ThemedText type="label" themeColor="primary">
            {t('timeline.notFound.link')}
          </ThemedText>
        </Link>
      </View>
    </>
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
