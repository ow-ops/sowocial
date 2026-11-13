import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { commentExcerpt, useOpenReports } from '@/api/ap/moderation';
import { ModerationState } from '@/components/moderation-failure';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { shortRelativeTime } from '@/utils/relative-time';

export default function Moderation() {
  const { t } = useTranslation();
  const reports = useOpenReports();

  return (
    <SettingsScreen title={t('moderation.title')} onRefresh={() => reports.refetch()}>
      <ModerationState
        pending={reports.isPending}
        error={reports.error}
        emptyText={reports.data?.length === 0 ? t('moderation.empty') : undefined}
        onRetry={() => void reports.refetch()}
      />
      {!!reports.data?.length && (
        <Section title={t('moderation.reports')}>
          {reports.data.map((report) => {
            const excerpt = commentExcerpt(report.comment);
            const summary = `${t(`moderation.category.${report.category}`)} · ${shortRelativeTime(report.createdAt)}`;
            return (
              <Row
                key={report.id}
                title={`@${report.targetAccount.acct}`}
                detail={excerpt ? `${summary}\n${excerpt}` : summary}
                chevron
                onPress={() => router.push({ pathname: '/moderation/[id]', params: { id: report.id } })}
              />
            );
          })}
        </Section>
      )}
    </SettingsScreen>
  );
}
