import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { useReconnect } from '@/auth/use-reconnect';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ReconnectBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session, needsReconnect } = useSession();
  const reconnect = useReconnect();
  if (!needsReconnect || !session) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        { top: insets.top + Spacing.two, backgroundColor: theme.surface, borderColor: theme.border },
      ]}>
      <ThemedText type="label" style={styles.text}>
        {t('auth.session.reconnect')}
      </ThemedText>
      <Button label={t('auth.session.reconnectAction')} loading={reconnect.isPending} onPress={() => reconnect.mutate(session)} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    ...Outlined,
    boxShadow: Shadow.raised,
  },
  text: {
    flex: 1,
  },
});
