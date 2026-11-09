import { router, Stack } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { keys } from '@/api/keys';
import { useTrendingLinks, useTrendingStatuses, useTrendingTags } from '@/api/ap/trends';
import { InfiniteList } from '@/components/infinite-list';
import { SegmentedControl } from '@/components/segmented-control';
import { Row } from '@/components/settings';
import { StatusList } from '@/components/status-list';
import { useOpenUrl } from '@/hooks/use-open-url';

type Kind = 'statuses' | 'tags' | 'links';
const KINDS: Kind[] = ['statuses', 'tags', 'links'];

export default function Trending() {
  const { t } = useTranslation();
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
      {kind === 'statuses' && <TrendingStatuses header={header} />}
      {kind === 'tags' && <TrendingTags header={header} />}
      {kind === 'links' && <TrendingLinks header={header} />}
    </>
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
