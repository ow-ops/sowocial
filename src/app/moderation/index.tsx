import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { commentExcerpt, useOpenReports } from '@/api/ap/moderation';
import { ModerationState } from '@/components/moderation-failure';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { shortRelativeTime } from '@/utils/relative-time';

export default function Moderation() {
  const { t } = useTranslation();
  const query = useOpenReports();
  const reports = query.data?.pages.flat();

  return (
    <SettingsScreen title={t('moderation.title')} onRefresh={() => query.refetch()}>
      <ModerationState
        pending={query.isPending}
        error={query.error}
        emptyText={reports?.length === 0 ? t('moderation.empty') : undefined}
        onRetry={() => void query.refetch()}
      />
      {!!reports?.length && (
        <Section title={t('moderation.reports')}>
          {reports.map((report) => {
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
          {query.hasNextPage && (
            <Row
              title={t('moderation.loadMore')}
              onPress={query.isFetchingNextPage ? undefined : () => void query.fetchNextPage()}
            />
          )}
        </Section>
      )}
    </SettingsScreen>
  );
}
