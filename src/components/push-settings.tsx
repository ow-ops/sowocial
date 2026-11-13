import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Switch, View, StyleSheet } from 'react-native';

import { keys } from '@/api/keys';
import { accountKey } from '@/auth/account-key';
import { useAuthedSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { Row, Section } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pushOperations } from '@/push/operations';
import { activeDistributor, chooseDelivery, pushDistributors } from '@/push/register';
import { handlesError, toastFailure } from '@/api/mutation-meta';

// The switch is on while a change is in flight, so it does not snap back before the server answers.
function usePushControls(session: Session) {
  const operations = useMemo(() => pushOperations(session), [session]);
  const queryClient = useQueryClient();
  const queryKey = keys.pushOn(accountKey(session));
  const state = useQuery({ queryKey, queryFn: operations.isOn });
  const enabled = !!state.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const toggle = useMutation({
    meta: handlesError,
    mutationFn: async (on: boolean) => {
      if (on) await operations.enable();
      else await operations.disable();
    },
    onError: (error) => toastFailure('notifications.push.failed', error),
    onSettled: refresh,
  });
  const deliver = useMutation({
    meta: handlesError,
    mutationFn: async (choice: string | null) => {
      if (enabled) await operations.disable();
      chooseDelivery(choice);
      if (enabled) await operations.enable();
    },
    onError: (error) => toastFailure('notifications.push.failed', error),
    onSettled: refresh,
  });
  return {
    on: toggle.isPending ? toggle.variables : enabled,
    busy: state.isPending || toggle.isPending || deliver.isPending,
    explanation: operations.explanation,
    toggle: toggle.mutate,
    deliver: deliver.mutate,
  };
}

export function PushSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const controls = usePushControls(useAuthedSession());
  const distributor = activeDistributor();
  const distributors = Platform.OS === 'android' ? pushDistributors() : [];
  const { busy } = controls;

  return (
    <>
      <Section title={t('notifications.push.section')}>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('notifications.push.label')}</ThemedText>
          <Switch
            value={controls.on}
            disabled={busy}
            onValueChange={controls.toggle}
            trackColor={{ true: theme.primary }}
            accessibilityLabel={t('notifications.push.label')}
          />
        </View>
        <ThemedText type="meta">
          {t(distributor ? controls.explanation.distributor : controls.explanation.relay)}
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
              onPress={busy ? undefined : () => controls.deliver(d.id)}
            />
          ))}
          <Row
            title={t('notifications.push.relay')}
            detail={t('notifications.push.viaRelay')}
            role="radio"
            selected={distributor === null}
            onPress={busy ? undefined : () => controls.deliver(null)}
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
