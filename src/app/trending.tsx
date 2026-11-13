import { router, Stack } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useBskyTrends } from '@/api/bsky/trends';
import { useCapabilities } from '@/api/backend';
import { keys } from '@/api/keys';
import { useTrendingLinks, useTrendingStatuses, useTrendingTags } from '@/api/ap/trends';
import { InfiniteList } from '@/components/infinite-list';
import { QueryState } from '@/components/query-state';
import { SegmentedControl } from '@/components/segmented-control';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { StatusList } from '@/components/status-list';
import { useOpenUrl } from '@/hooks/use-open-url';

type Kind = 'statuses' | 'tags' | 'links';
const KINDS: Kind[] = ['statuses', 'tags', 'links'];

export default function Trending() {
  const { t } = useTranslation();
  const { trendingTopics } = useCapabilities();
  const [kind, setKind] = useState<Kind>('statuses');
  const header = (
    <SegmentedControl
      label={t('timeline.trending.title')}
      options={KINDS.map((value) => ({ value, label: t(`timeline.trending.${value}`) }))}
      value={kind}
      onChange={setKind}
    />
  );
  return (
    <>
      <Stack.Screen options={{ title: t('common.nav.trending') }} />
      {trendingTopics && <BskyTrends />}
      {!trendingTopics && kind === 'statuses' && <TrendingStatuses header={header} />}
      {!trendingTopics && kind === 'tags' && <TrendingTags header={header} />}
      {!trendingTopics && kind === 'links' && <TrendingLinks header={header} />}
    </>
  );
}

function BskyTrends() {
  const { t } = useTranslation();
  const { data, isPending, error, refetch } = useBskyTrends();
  return (
    <SettingsScreen>
      {(isPending || error || data?.length === 0) && (
        <QueryState
          pending={isPending}
          error={error}
          emptyText={t('timeline.trending.emptyTopics')}
          onRetry={() => refetch()}
        />
      )}
      {data && data.length > 0 && (
        <Section title={t('timeline.trending.title')}>
          {data.map((trend) => (
            <Row
              key={trend.topic}
              title={trend.displayName}
              detail={trend.description}
              chevron
              onPress={() => router.navigate({ pathname: '/search', params: { q: trend.displayName } })}
            />
          ))}
        </Section>
      )}
    </SettingsScreen>
  );
}

type HeaderProps = { header: ReactElement };

function TrendingStatuses({ header }: HeaderProps) {
  const { t } = useTranslation();
  return (
    <StatusList
      header={header}
      query={useTrendingStatuses()}
      queryKey={keys.trending('statuses')}
      emptyText={t('timeline.trending.emptyStatuses')}
    />
  );
}

function TrendingTags({ header }: HeaderProps) {
  const { t } = useTranslation();
  return (
    <InfiniteList
      header={header}
      query={useTrendingTags()}
      queryKey={keys.trending('tags')}
      keyExtractor={(tag) => tag.name}
      renderItem={(tag) => {
        const uses = tag.history?.reduce((sum, day) => sum + Number(day.uses), 0) ?? 0;
        return (
          <Row
            title={`#${tag.name}`}
            detail={t('timeline.trending.uses', { count: uses })}
            chevron
            onPress={() => router.push({ pathname: '/tag/[name]', params: { name: tag.name } })}
          />
        );
      }}
      emptyText={t('timeline.trending.emptyTags')}
    />
  );
}

function TrendingLinks({ header }: HeaderProps) {
  const { t } = useTranslation();
  const openUrl = useOpenUrl();
  return (
    <InfiniteList
      header={header}
      query={useTrendingLinks()}
      queryKey={keys.trending('links')}
      keyExtractor={(link) => link.url}
      renderItem={(link) => (
        <Row
          title={link.title || link.url}
          detail={link.providerName || new URL(link.url).hostname}
          chevron
          onPress={() => openUrl(link.url)}
        />
      )}
      emptyText={t('timeline.trending.emptyLinks')}
    />
  );
}
