import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Switch, View, type TextInputProps } from 'react-native';

import {
  canResendConfirmation,
  isOldEnough,
  signUpFields,
  signUpOutcome,
  signUpParams,
  webSignUpUrl,
  type FieldError,
} from '@/auth/sign-up-plan';
import { useSignUpInfo } from '@/auth/use-sign-up-info';
import { Button } from '@/components/button';
import { DateTimeField } from '@/components/date-time-field';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSignUp } from '@/hooks/use-sign-up';
import { useTheme } from '@/hooks/use-theme';
import { openLink } from '@/utils/open-link';

const defaultBirthDate = (minAge: number) => {
  const now = new Date();
  return new Date(now.getFullYear() - Math.max(minAge, 18), now.getMonth(), now.getDate());
};

function Field({ label, error, ...input }: TextInputProps & { label: string; error?: FieldError }) {
  return (
    <View style={styles.field}>
      <ThemedText type="labelSmall">{label}</ThemedText>
      <TextField accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} {...input} />
      {error ? (
        <ThemedText type="meta" themeColor="danger" accessibilityLiveRegion="polite">
          {error.description}
        </ThemedText>
      ) : null}
    </View>
  );
}

export default function SignUpScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { server } = useLocalSearchParams<{ server: string }>();
  const { data, error, isPending, refetch } = useSignUpInfo(server ?? '');
  const [agreed, setAgreed] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const { pending, errors, needsWeb, register, check, resend } = useSignUp();
  const openWeb = () => openLink(webSignUpUrl(data!.instance, data!.sourceUrl));

  if (isPending || error || !data) {
    return (
      <SettingsScreen title={t('auth.signUp.title')}>
        {error ? (
          <View style={styles.block}>
            <ThemedText themeColor="danger">{t('auth.signUp.unreachable', { server })}</ThemedText>
            <Button label={t('common.retry')} onPress={() => void refetch()} />
          </View>
        ) : (
          <ActivityIndicator color={theme.primary} accessibilityLabel={t('auth.signUp.loading')} />
        )}
      </SettingsScreen>
    );
  }

  const { registrations, rules, title } = data;
  const name = title || data.domain;
  const fields = signUpFields(registrations);

  if (!registrations.enabled) {
    return (
      <SettingsScreen title={t('auth.signUp.title')}>
        <View style={styles.block}>
          <ThemedText type="display">{t('auth.signUp.closedTitle', { server: name })}</ThemedText>
          <ThemedText>{t('auth.signUp.closed')}</ThemedText>
          <Button label={t('auth.oauth.backToSignIn')} variant="outline" onPress={() => router.back()} />
        </View>
      </SettingsScreen>
    );
  }

  if (needsWeb) {
    return (
      <SettingsScreen title={t('auth.signUp.title')}>
        <View style={styles.block}>
          <ThemedText type="display">{t('auth.signUp.webTitle')}</ThemedText>
          <ThemedText>{t('auth.signUp.web', { server: name })}</ThemedText>
          <Button label={t('auth.signUp.openWeb')} onPress={openWeb} />
          <Button label={t('auth.oauth.backToSignIn')} variant="outline" onPress={() => router.back()} />
        </View>
      </SettingsScreen>
    );
  }

  if (pending) {
    const approval = signUpOutcome(registrations.approvalRequired, false) === 'pending';
    return (
      <SettingsScreen title={t('auth.signUp.title')}>
        <View style={styles.block}>
          <ThemedText type="display">{t(approval ? 'auth.signUp.pendingTitle' : 'auth.signUp.confirmTitle')}</ThemedText>
          <ThemedText>{t(approval ? 'auth.signUp.pending' : 'auth.signUp.confirm', { email: email.trim(), server: name })}</ThemedText>
          <Button label={t('auth.signUp.continue')} loading={check.isPending} onPress={() => check.mutate()} />
          {!approval && canResendConfirmation(data.sourceUrl) && (
            <Button
              label={t('auth.signUp.resend')}
              variant="outline"
              loading={resend.isPending}
              onPress={() => resend.mutate()}
            />
          )}
          <Button label={t('auth.oauth.backToSignIn')} variant="outline" onPress={() => router.back()} />
        </View>
      </SettingsScreen>
    );
  }

  const minAge = registrations.minAge ?? 0;
  const tooYoung = !!birthDate && !isOldEnough(birthDate, minAge);
  const ready =
    agreed &&
    !!username.trim() &&
    !!email.trim() &&
    !!password &&
    (!fields.reasonRequired || !!reason.trim()) &&
    (!fields.birthDate || (!!birthDate && !tooYoung));
  const submit = () => {
    if (!ready || register.isPending) return;
    register.mutate({ instance: data.instance, params: signUpParams({ username, email, password, reason, birthDate }, fields) });
  };

  return (
    <SettingsScreen title={t('auth.signUp.title')}>
      <View style={styles.intro}>
        <ThemedText type="display">{t('auth.signUp.headline', { server: name })}</ThemedText>
        <ThemedText type="meta">{data.domain}</ThemedText>
      </View>

      {rules.length > 0 && (
        <Section title={t('auth.signUp.rules')}>
          <View style={styles.rules}>
            {rules.map((rule, i) => (
              <View key={rule.id} style={styles.rule}>
                <ThemedText type="name" themeColor="primary" style={styles.number}>
                  {i + 1}.
                </ThemedText>
                <ThemedText style={styles.ruleText}>{rule.text}</ThemedText>
              </View>
            ))}
          </View>
        </Section>
      )}

      <Section title={t('auth.signUp.agreement')}>
        <Row
          title={t('auth.signUp.agree', { server: name })}
          role="switch"
          selected={agreed}
          onPress={() => setAgreed(!agreed)}
          trailing={
            <Switch
              value={agreed}
              onValueChange={setAgreed}
              trackColor={{ true: theme.primary }}
              accessibilityLabel={t('auth.signUp.agree', { server: name })}
            />
          }
        />
        {errors.agreement ? (
          <ThemedText type="meta" themeColor="danger">
            {errors.agreement.description}
          </ThemedText>
        ) : null}
      </Section>

      <Section title={t('auth.signUp.account')}>
        <View style={styles.form}>
          <Field
            label={t('auth.signUp.username')}
            value={username}
            onChangeText={setUsername}
            error={errors.username}
            textContentType="username"
            autoComplete="username-new"
            returnKeyType="next"
            editable={!register.isPending}
          />
          <Field
            label={t('auth.signUp.email')}
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            editable={!register.isPending}
          />
          <Field
            label={t('auth.signUp.password')}
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType={fields.birthDate || fields.reason ? 'next' : 'go'}
            onSubmitEditing={fields.birthDate || fields.reason ? undefined : submit}
            editable={!register.isPending}
          />
          {fields.birthDate && (
            <View style={styles.field}>
              <ThemedText type="labelSmall">{t('auth.signUp.birthDate', { age: minAge })}</ThemedText>
              <View style={styles.date}>
                <DateTimeField
                  mode="date"
                  label={t('auth.signUp.birthDateLabel')}
                  value={birthDate ?? defaultBirthDate(minAge)}
                  maximumDate={new Date()}
                  onChange={setBirthDate}
                />
              </View>
              {tooYoung || errors.dateOfBirth ? (
                <ThemedText type="meta" themeColor="danger" accessibilityLiveRegion="polite">
                  {tooYoung ? t('auth.signUp.tooYoung', { age: minAge }) : errors.dateOfBirth?.description}
                </ThemedText>
              ) : !birthDate ? (
                <ThemedText type="meta">{t('auth.signUp.birthDateRequired')}</ThemedText>
              ) : null}
            </View>
          )}
          {fields.reason && (
            <Field
              label={t(fields.reasonRequired ? 'auth.signUp.reason' : 'auth.signUp.reasonOptional')}
              value={reason}
              onChangeText={setReason}
              error={errors.reason}
              autoCapitalize="sentences"
              multiline
              style={styles.reason}
              editable={!register.isPending}
            />
          )}
        </View>
      </Section>

      <Button label={t('auth.signUp.submit')} onPress={submit} disabled={!ready} loading={register.isPending} />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  block: {
    gap: Spacing.three,
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  date: {
    alignItems: 'flex-start',
  },
  reason: {
    minHeight: 96,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
  rules: {
    gap: Spacing.three,
  },
  rule: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  number: {
    minWidth: 24,
    fontVariant: ['tabular-nums'],
  },
  ruleText: {
    flex: 1,
  },
});
