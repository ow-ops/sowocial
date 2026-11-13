import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useCapabilities } from '@/api/backend';
import { useHomeSources } from '@/api/home-sources';
import { useFollowRequestCount } from '@/api/ap/profile-extras';
import { useTrendsAvailable } from '@/api/ap/trends';
import { Row, Section, SettingsScreen } from '@/components/settings';

export default function More() {
  return useCapabilities().feeds ? <BlueskyMore /> : <FediverseMore />;
}

function BlueskyMore() {
  const { t } = useTranslation();
  const { trendingTopics } = useCapabilities();
  const { accounts } = useHomeSources();
  return (
    <SettingsScreen title={t('common.nav.more')}>
      <Section title={t('timeline.more.timelines')}>
        <Row title={t('timeline.feeds.title')} chevron onPress={() => router.push('/feeds')} />
        {trendingTopics && <Row title={t('common.nav.trending')} chevron onPress={() => router.push('/trending')} />}
      </Section>
      <Section title={t('timeline.search.saved')}>
        <Row
          title={t('timeline.search.bookmarks')}
          chevron
          onPress={() => router.push({ pathname: '/saved/[kind]', params: { kind: 'bookmarks' } })}
        />
      </Section>
      <Section title={t('timeline.more.organise')}>
        <Row title={t('timeline.search.lists')} chevron onPress={() => router.push('/lists')} />
        <Row title={t('common.nav.drafts')} chevron onPress={() => router.push('/drafts')} />
        {accounts && <Row title={t('timeline.more.findFollows')} chevron onPress={() => router.push('/find-follows')} />}
      </Section>
      <Section title={t('timeline.more.safety')}>
        <Row title={t('settings.mutedWords.title')} chevron onPress={() => router.push('/settings/muted-words')} />
      </Section>
    </SettingsScreen>
  );
}

function FediverseMore() {
  const { t } = useTranslation();
  const trends = useTrendsAvailable().data;
  const requests = useFollowRequestCount();
  const { accounts } = useHomeSources();
  return (
    <SettingsScreen title={t('common.nav.more')}>
      <Section title={t('timeline.more.timelines')}>
        <Row title={t('common.nav.federated')} chevron onPress={() => router.push('/federated')} />
        {trends === true && <Row title={t('common.nav.trending')} chevron onPress={() => router.push('/trending')} />}
        {trends === false && <Row title={t('common.nav.trending')} detail={t('common.unavailable')} />}
      </Section>
      <Section title={t('timeline.search.saved')}>
        <Row
          title={t('timeline.search.bookmarks')}
          chevron
          onPress={() => router.push({ pathname: '/saved/[kind]', params: { kind: 'bookmarks' } })}
        />
        <Row
          title={t('timeline.search.favourites')}
          chevron
          onPress={() => router.push({ pathname: '/saved/[kind]', params: { kind: 'favourites' } })}
        />
      </Section>
      <Section title={t('timeline.more.organise')}>
        <Row title={t('timeline.search.lists')} chevron onPress={() => router.push('/lists')} />
        <Row title={t('timeline.search.followedHashtags')} chevron onPress={() => router.push('/followed-tags')} />
        <Row title={t('common.nav.scheduled')} chevron onPress={() => router.push('/scheduled')} />
        <Row title={t('common.nav.drafts')} chevron onPress={() => router.push('/drafts')} />
        <Row
          title={t('profile.followRequests.title')}
          detail={requests ? t('profile.followRequests.pending', { count: requests }) : undefined}
          chevron
          onPress={() => router.push('/follow-requests')}
        />
        {accounts && <Row title={t('timeline.more.findFollows')} chevron onPress={() => router.push('/find-follows')} />}
      </Section>
      <Section title={t('timeline.more.safety')}>
        <Row title={t('settings.content.filters')} chevron onPress={() => router.push('/settings/filters')} />
        <Row title={t('settings.privacy.muted')} chevron onPress={() => router.push('/settings/muted')} />
        <Row title={t('settings.privacy.blocked')} chevron onPress={() => router.push('/settings/blocked')} />
        <Row title={t('settings.privacy.blockedServers')} chevron onPress={() => router.push('/settings/blocked-domains')} />
      </Section>
    </SettingsScreen>
  );
}
