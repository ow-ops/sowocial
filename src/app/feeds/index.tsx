import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SavedFeedEntry } from '@/api/bsky/feed-data';
import { useFeedSearch, useSavedFeeds, useSuggestedFeeds } from '@/api/bsky/feeds';
import { FeedRow } from '@/components/feed-row';
import { QueryState } from '@/components/query-state';
import { Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { useDebounced } from '@/hooks/use-debounced';

const SEARCH_DEBOUNCE_MS = 300;

function FeedRows({ entries }: { entries: SavedFeedEntry[] }) {
  return entries.map(({ saved, view }) => <FeedRow key={saved.id} view={view} pathname="/feeds/[id]" />);
}

function Discover() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const term = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const suggested = useSuggestedFeeds();
  const found = useFeedSearch(term);
  const feeds = term ? found : suggested;
  return (
    <Section title={t('timeline.feeds.discover')}>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('timeline.feeds.searchPlaceholder')}
        accessibilityLabel={t('timeline.feeds.searchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {(feeds.isPending || feeds.error || feeds.data?.length === 0) && (
        <QueryState
          pending={feeds.isPending}
          error={feeds.error}
          emptyText={t('timeline.feeds.noResults')}
          onRetry={() => feeds.refetch()}
        />
      )}
      {feeds.data?.map((view) => <FeedRow key={view.uri} view={view} pathname="/feeds/info/[id]" />)}
    </Section>
  );
}

export default function Feeds() {
  const { t } = useTranslation();
  const { data, isPending, error, refetch } = useSavedFeeds();
  const pinned = data?.filter((e) => e.saved.pinned) ?? [];
  const saved = data?.filter((e) => !e.saved.pinned) ?? [];
  return (
    <SettingsScreen title={t('timeline.feeds.title')}>
      {(isPending || error || data?.length === 0) && (
        <Section title={t('timeline.feeds.title')}>
          <QueryState
            pending={isPending}
            error={error}
            emptyText={t('timeline.feeds.intro')}
            onRetry={() => refetch()}
          />
        </Section>
      )}
      {pinned.length > 0 && (
        <Section title={t('timeline.feeds.pinned')}>
          <FeedRows entries={pinned} />
        </Section>
      )}
      {saved.length > 0 && (
        <Section title={t('timeline.feeds.saved')}>
          <FeedRows entries={saved} />
        </Section>
      )}
      <Discover />
    </SettingsScreen>
  );
}
