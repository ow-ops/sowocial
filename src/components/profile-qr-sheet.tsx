import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useAccount } from '@/api/accounts';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const QR_SIZE = 240;

export function ProfileQr({ id, handle }: { id: string; handle: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: account } = useAccount(id);

  return (
    <View style={styles.content}>
      <ThemedText type="name" accessibilityRole="header">
        {t('profile.qr.title')}
      </ThemedText>
      {account ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('profile.qr.a11y', { handle })}
          style={[styles.code, { backgroundColor: Colors.light.page }]}>
          <QRCode
            value={account.url}
            size={QR_SIZE}
            color={Colors.light.heading}
            backgroundColor={Colors.light.page}
            ecl="M"
          />
        </View>
      ) : (
        <ActivityIndicator color={theme.muted} style={styles.loading} />
      )}
      <ThemedText type="name" selectable style={styles.handle}>
        {handle}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  code: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  loading: {
    height: QR_SIZE,
  },
  handle: {
    textAlign: 'center',
  },
});
