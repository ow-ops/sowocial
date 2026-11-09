import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Switch, View, StyleSheet } from 'react-native';

import { requireMasto, useMasto } from '@/api/client';
import { keys } from '@/api/keys';
import { usePushSubscription } from '@/api/ap/instance';
import { Section } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PUSH_RELAY_URL } from '@/push/config';
import { disablePush, enablePush } from '@/push/register';
import { handlesError } from '@/api/mutation-meta';

export function PushSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const masto = useMasto();
  const queryClient = useQueryClient();
  const subscription = usePushSubscription();
  // Another app may have subscribed with this token; only ours goes through the relay.
  const enabled = !!subscription.data?.endpoint.startsWith(PUSH_RELAY_URL);
  const toggle = useMutation({
    meta: handlesError,
    mutationFn: async (on: boolean) => {
      if (on) await enablePush(requireMasto(masto));
      else await disablePush(requireMasto(masto));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.pushSubscription }),
  });

  return (
    <Section title={t('notifications.push.section')}>
      <View style={styles.row}>
        <ThemedText style={styles.label}>{t('notifications.push.label')}</ThemedText>
        <Switch
          value={toggle.isPending ? toggle.variables : enabled}
          disabled={subscription.isPending || toggle.isPending}
          onValueChange={(on) => toggle.mutate(on)}
          trackColor={{ true: theme.primary }}
          accessibilityLabel={t('notifications.push.label')}
        />
      </View>
      <ThemedText type="meta">{t('notifications.push.explanation')}</ThemedText>
      {toggle.isError && <ThemedText themeColor="danger">{toggle.error.message}</ThemedText>}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  label: {
    flex: 1,
  },
});
