import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { handlesError } from '@/api/mutation-meta';
import {
  DEFAULT_SERVICES,
  isServiceId,
  resolveServices,
  SERVICE_KINDS,
  type BskyServices,
  type ServiceKind,
} from '@/auth/bsky-services';
import { useAuthedSession, useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function ServicesScreen() {
  const { t } = useTranslation();
  const session = useAuthedSession();
  const { setServices } = useSession();
  const [values, setValues] = useState(() => (session.protocol === 'bsky' ? resolveServices(session) : DEFAULT_SERVICES));
  const [invalid, setInvalid] = useState<ServiceKind | null>(null);

  const save = useMutation({
    meta: handlesError,
    mutationFn: async (next: BskyServices | undefined) => {
      if (session.protocol !== 'bsky') return;
      await setServices(session, next);
      router.back();
    },
  });

  if (session.protocol !== 'bsky') return null;

  const submit = () => {
    const entered = Object.fromEntries(SERVICE_KINDS.map((kind) => [kind, values[kind].trim() || DEFAULT_SERVICES[kind]]));
    const bad = SERVICE_KINDS.find((kind) => !isServiceId(entered[kind]));
    setInvalid(bad ?? null);
    if (!bad) save.mutate(entered);
  };

  const reset = () => {
    setValues(DEFAULT_SERVICES);
    setInvalid(null);
    save.mutate(undefined);
  };

  return (
    <SettingsScreen title={t('settings.services.title')}>
      <Section title={t('settings.services.section')}>
        <ThemedText type="meta">{t('settings.services.hint')}</ThemedText>
        {SERVICE_KINDS.map((kind) => (
          <View key={kind} style={styles.field}>
            <ThemedText type="label">{t(`settings.services.${kind}`)}</ThemedText>
            <TextField
              value={values[kind]}
              onChangeText={(value) => setValues((current) => ({ ...current, [kind]: value }))}
              placeholder={DEFAULT_SERVICES[kind]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!save.isPending}
              accessibilityLabel={t(`settings.services.${kind}`)}
            />
            {invalid === kind && <ThemedText themeColor="danger">{t('settings.services.invalid')}</ThemedText>}
          </View>
        ))}
        {save.isError && <ThemedText themeColor="danger">{save.error.message}</ThemedText>}
        <View style={styles.actions}>
          <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
          <Button label={t('settings.services.reset')} variant="outline" onPress={reset} disabled={save.isPending} />
        </View>
      </Section>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
});
