import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { useAccount, useReport } from '@/api/accounts';
import type { ReportCategory } from '@/api/bsky/report';
import { ActingAccount } from '@/auth/session';
import { Button } from '@/components/button';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { ThemedText, textStyles } from '@/components/themed-text';
import { BorderWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { domainOf } from '@/utils/acct';

const CATEGORIES: ReportCategory[] = ['spam', 'violation', 'other'];

export default function ReportScreen() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  return (
    <ActingAccount account={account}>
      <ReportForm />
    </ActingAccount>
  );
}

function ReportForm() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { accountId, statusId } = useLocalSearchParams<{ accountId: string; statusId?: string }>();
  const { data: account } = useAccount(accountId);
  const report = useReport();
  const [category, setCategory] = useState<ReportCategory>('spam');
  const [comment, setComment] = useState('');
  const [forward, setForward] = useState(true);
  const bsky = account?.protocol === 'bsky';
  const remote = account && !bsky ? domainOf(account.handle) : null;
  const copy = bsky ? 'Bsky' : '';

  if (report.isSuccess) {
    return (
      <SettingsScreen>
        <ThemedText type="name">{t(`profile.report.thanks${copy}`)}</ThemedText>
        <Button label={t('common.done')} onPress={() => router.back()} />
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen title={t('common.nav.report')}>
      <ThemedText>
        <Trans
          i18nKey={statusId ? `profile.report.introWithPost${copy}` : `profile.report.intro${copy}`}
          values={{ acct: account?.handle }}
          components={[<ThemedText key="acct" themeColor="heading" />]}
        />
      </ThemedText>

      <Section title={t('profile.report.what')}>
        <View accessibilityRole="radiogroup" style={styles.list}>
          {CATEGORIES.map((c) => (
            <Row
              key={c}
              title={t(c === 'violation' ? `profile.report.violation${copy}.title` : `profile.report.${c}.title`)}
              detail={t(c === 'violation' ? `profile.report.violation${copy}.detail` : `profile.report.${c}.detail`)}
              role="radio"
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('profile.report.details')}>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t('profile.report.placeholder')}
          placeholderTextColor={theme.muted}
          selectionColor={theme.primary}
          multiline
          maxLength={1000}
          accessibilityLabel={t('profile.report.detailsA11y')}
          style={[styles.comment, { color: theme.heading, borderColor: theme.outline }]}
        />
      </Section>

      {remote && (
        <View style={styles.forward}>
          <ThemedText style={styles.forwardText}>{t('profile.report.forward', { domain: remote })}</ThemedText>
          <Switch
            value={forward}
            onValueChange={setForward}
            trackColor={{ true: theme.primary }}
            accessibilityLabel={t('profile.report.forwardA11y', { domain: remote })}
          />
        </View>
      )}

      {report.isError && <ThemedText themeColor="danger">{report.error.message}</ThemedText>}
      <Button
        label={t('profile.report.send')}
        loading={report.isPending}
        disabled={!account}
        onPress={() =>
          report.mutate({
            accountId,
            statusIds: statusId ? [statusId] : undefined,
            comment,
            forward: !!remote && forward,
            category,
          })
        }
      />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  comment: {
    minHeight: 120,
    ...textStyles.input,
    padding: Spacing.three,
    borderWidth: BorderWidth.input,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    textAlignVertical: 'top',
  },
  forward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  forwardText: {
    flex: 1,
  },
});
