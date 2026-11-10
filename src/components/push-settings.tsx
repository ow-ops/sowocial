import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Platform, Switch, View, StyleSheet } from 'react-native';

import { requireMasto, useMasto } from '@/api/client';
import { keys } from '@/api/keys';
import { usePushSubscription } from '@/api/ap/instance';
import { useApSession } from '@/auth/session';
import { Row, Section } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  activeDistributor,
  chooseDelivery,
  disablePush,
  enablePush,
  isOurSubscription,
  pushDistributors,
} from '@/push/register';
import { handlesError, toastFailure } from '@/api/mutation-meta';

export function PushSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const masto = useMasto();
  const token = useApSession()?.token ?? '';
  const queryClient = useQueryClient();
  const subscription = usePushSubscription();
  const enabled = !!subscription.data && isOurSubscription(subscription.data.endpoint, token);
  const distributors = Platform.OS === 'android' ? pushDistributors() : [];
  const distributor = activeDistributor();
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.pushSubscription });
  const toggle = useMutation({
    meta: handlesError,
    mutationFn: async (on: boolean) => {
      if (on) await enablePush(requireMasto(masto), token);
      else await disablePush(requireMasto(masto), token);
    },
    onError: (error) => toastFailure('notifications.push.failed', error),
    onSettled: refresh,
  });
  const deliver = useMutation({
    meta: handlesError,
    mutationFn: async (choice: string | null) => {
      const client = requireMasto(masto);
      if (enabled) await disablePush(client, token);
      chooseDelivery(choice);
      if (enabled) await enablePush(client, token);
    },
    onError: (error) => toastFailure('notifications.push.failed', error),
    onSettled: refresh,
  });
  const busy = subscription.isPending || toggle.isPending || deliver.isPending;

  return (
    <>
      <Section title={t('notifications.push.section')}>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('notifications.push.label')}</ThemedText>
          <Switch
            value={toggle.isPending ? toggle.variables : enabled}
            disabled={busy}
            onValueChange={(on) => toggle.mutate(on)}
            trackColor={{ true: theme.primary }}
            accessibilityLabel={t('notifications.push.label')}
          />
        </View>
        <ThemedText type="meta">
          {t(distributor ? 'notifications.push.explanationDistributor' : 'notifications.push.explanation')}
        </ThemedText>
      </Section>
      {distributors.length > 0 && (
        <Section title={t('notifications.push.delivery')}>
          {distributors.map((d) => (
            <Row
              key={d.id}
              title={d.name}
              detail={t('notifications.push.viaDistributor')}
              role="radio"
              selected={distributor === d.id}
              onPress={busy ? undefined : () => deliver.mutate(d.id)}
            />
          ))}
          <Row
            title={t('notifications.push.relay')}
            detail={t('notifications.push.viaRelay')}
            role="radio"
            selected={distributor === null}
            onPress={busy ? undefined : () => deliver.mutate(null)}
          />
        </Section>
      )}
    </>
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
