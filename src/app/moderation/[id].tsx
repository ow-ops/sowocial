import { useLocalSearchParams } from 'expo-router';
import type { mastodon } from 'masto';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  availableActions,
  useAccountAction,
  useModerateReport,
  useReport,
  useSelfAccountId,
  type AccountAction,
} from '@/api/ap/moderation';
import { useServerFeatures } from '@/api/ap/server';
import { AccountRow } from '@/components/account-row';
import { Button } from '@/components/button';
import { ModerationState } from '@/components/moderation-failure';
import { Section, SettingsScreen } from '@/components/settings';
import { StatusCard } from '@/components/status-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { toAuthor, toPost } from '@/model/adapters/ap';
import { confirmAction } from '@/utils/dialog';

const DESTRUCTIVE: AccountAction[] = ['suspend', 'disable'];

export default function ReportDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const report = useReport(id);
  return (
    <SettingsScreen title={t('moderation.title')}>
      <ModerationState pending={report.isPending} error={report.error} onRetry={() => void report.refetch()} />
      {report.data && <ReportBody id={id} report={report.data} />}
    </SettingsScreen>
  );
}

function ReportBody({ id, report }: { id: string; report: mastodon.v1.admin.Report }) {
  const { t } = useTranslation();
  const gotosocial = useServerFeatures().data?.software === 'gotosocial';
  const selfId = useSelfAccountId();
  const moderate = useModerateReport(id);
  const accountAction = useAccountAction(id, report.targetAccount.id);
  const target = toAuthor(report.targetAccount);
  const statuses = report.statuses.map(toPost);
  const actions = availableActions(report, selfId, gotosocial);
  const busy = moderate.isPending || accountAction.isPending;

  const takeAction = (type: AccountAction) =>
    confirmAction(
      `${t('moderation.confirm', { action: t(`moderation.${type}`), handle: target.handle })}\n\n${t(`moderation.effect.${type}`)}`,
      t(`moderation.${type}`),
      () => accountAction.mutate(type),
      { destructive: DESTRUCTIVE.includes(type) },
    );

  const assigned = report.assignedAccount;
  const assignment = !assigned
    ? gotosocial
      ? null
      : t('moderation.assigned.nobody')
    : assigned.id === selfId
      ? t('moderation.assigned.you')
      : t('moderation.assigned.other', { handle: assigned.acct });
  const status = [report.actionTaken ? t('moderation.state.resolved') : t('moderation.state.open'), assignment]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <ThemedText type="meta">{status}</ThemedText>
      <Section title={t('moderation.reportedAccount')}>
        <AccountRow account={target} />
      </Section>
      <Section title={t('moderation.comment')}>
        <ThemedText>{report.comment || t('moderation.noComment')}</ThemedText>
      </Section>
      {statuses.length > 0 && (
        <Section title={t('moderation.reportedPosts')}>
          {statuses.map((status) => (
            <StatusCard key={status.key} status={status} />
          ))}
        </Section>
      )}
      {actions.report.length > 0 && (
        <Section title={t('moderation.actions')}>
          <View style={styles.buttons}>
            {actions.report.map((action) => (
              <Button
                key={action}
                label={action === 'assignToSelf' ? t('moderation.assignToMe') : t(`moderation.${action}`)}
                variant="outline"
                size="small"
                loading={moderate.isPending && moderate.variables === action}
                disabled={busy}
                onPress={() => moderate.mutate(action)}
              />
            ))}
          </View>
        </Section>
      )}
      <Section title={t('moderation.accountActions')}>
        <View style={styles.buttons}>
          {actions.account.map((type) => (
            <Button
              key={type}
              label={t(`moderation.${type}`)}
              variant="outline"
              size="small"
              destructive={DESTRUCTIVE.includes(type)}
              loading={accountAction.isPending && accountAction.variables === type}
              disabled={busy}
              onPress={() => takeAction(type)}
            />
          ))}
        </View>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
