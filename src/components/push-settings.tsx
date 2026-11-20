import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Switch, View, StyleSheet } from 'react-native';

import { keys } from '@/api/keys';
import { accountKey } from '@/auth/account-key';
import { lacksScopes } from '@/auth/auth-failure';
import { useAuthedSession } from '@/auth/session';
import { useReauthorise } from '@/auth/use-reconnect';
import type { Session } from '@/auth/types';
import { Button } from '@/components/button';
import { Row, Section } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pushOperations } from '@/push/operations';
import { activeDistributor, chooseDelivery, pushDistributors } from '@/push/distributor';
import { handlesError, toastFailure } from '@/api/mutation-meta';

// The switch is on while a change is in flight, so it does not snap back before the server answers.
function usePushControls(session: Session) {
  const operations = useMemo(() => pushOperations(session), [session]);
  const queryClient = useQueryClient();
  const queryKey = keys.pushOn(accountKey(session));
  const state = useQuery({ queryKey, queryFn: operations.isOn });
  const enabled = !!state.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  // A token from before the app asked for the push scope is refused; signing in again gets one that has it.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const reauthorise = useReauthorise().mutateAsync;
  const onError = (error: Error) => {
    if (lacksScopes(error)) setNeedsSignIn(true);
    else toastFailure('notifications.push.failed', error);
  };
  const toggle = useMutation({
    meta: handlesError,
    mutationFn: async (on: boolean) => {
      if (on) await operations.enable();
      else await operations.disable();
    },
    onError,
    onSettled: refresh,
  });
  const deliver = useMutation({
    meta: handlesError,
    mutationFn: async (choice: string | null) => {
      if (enabled) await operations.disable();
      chooseDelivery(choice);
      if (enabled) await operations.enable();
    },
    onError,
    onSettled: refresh,
  });
  const signIn = useMutation({
    meta: handlesError,
    mutationFn: async () => {
      const next = await reauthorise();
      if (!next) return;
      await pushOperations(next).enable();
      setNeedsSignIn(false);
    },
    onError,
    onSettled: refresh,
  });
  return {
    on: toggle.isPending ? toggle.variables : enabled,
    busy: state.isPending || toggle.isPending || deliver.isPending || signIn.isPending,
    needsSignIn,
    signIn: signIn.mutate,
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
        {controls.needsSignIn && (
          <>
            <ThemedText type="meta" themeColor="danger" accessibilityRole="alert">
              {t('notifications.push.signInNeeded')}
            </ThemedText>
            <View style={styles.row}>
              <Button
                label={t('notifications.push.signInAgain')}
                size="small"
                disabled={busy}
                onPress={() => controls.signIn()}
              />
            </View>
          </>
        )}
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
