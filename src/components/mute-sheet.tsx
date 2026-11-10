import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { useAccount, useMuteAccount } from '@/api/accounts';
import { Button } from '@/components/button';
import { Row, Section } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const HOUR = 3600;
const DURATIONS = [
  { seconds: 0, key: 'forever' },
  { seconds: HOUR, key: 'hour' },
  { seconds: 24 * HOUR, key: 'day' },
  { seconds: 7 * 24 * HOUR, key: 'week' },
  { seconds: 30 * 24 * HOUR, key: 'month' },
] as const;

export function MuteForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: account } = useAccount(accountId);
  const mute = useMuteAccount(accountId);
  const [seconds, setSeconds] = useState<number>(0);
  const [hideNotifications, setHideNotifications] = useState(true);

  return (
    <View style={styles.form}>
      <ThemedText type="name" accessibilityRole="header">
        {t('common.nav.mute')}
      </ThemedText>
      <ThemedText>
        <Trans
          i18nKey="profile.mute.intro"
          values={{ acct: account?.handle }}
          components={[<ThemedText key="acct" themeColor="heading" />]}
        />
      </ThemedText>

      <Section title={t('profile.mute.for')}>
        <View accessibilityRole="radiogroup" style={styles.list}>
          {DURATIONS.map((d) => (
            <Row
              key={d.seconds}
              title={t(`profile.mute.durations.${d.key}`)}
              role="radio"
              selected={seconds === d.seconds}
              onPress={() => setSeconds(d.seconds)}
            />
          ))}
        </View>
      </Section>

      <Row
        title={t('profile.mute.hideNotifications')}
        detail={t('profile.mute.hideNotificationsDetail')}
        role="switch"
        selected={hideNotifications}
        onPress={() => setHideNotifications((on) => !on)}
        trailing={
          <Switch
            value={hideNotifications}
            onValueChange={setHideNotifications}
            trackColor={{ true: theme.primary }}
            accessibilityLabel={t('profile.mute.hideNotifications')}
          />
        }
      />

      <Button
        label={t('profile.mute.action')}
        loading={mute.isPending}
        disabled={!account}
        onPress={() => mute.mutate({ duration: seconds, notifications: hideNotifications }, { onSuccess: onDone })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
});
