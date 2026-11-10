import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { useSearch, useSuggestedFollows } from '@/api/search';
import { AccountRow } from '@/components/account-row';
import { Avatar } from '@/components/avatar';
import { FeedBar } from '@/components/feed-bar';
import { Row, Section } from '@/components/settings';
import { StatusCard } from '@/components/status-card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Press, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useOpenUrl } from '@/hooks/use-open-url';
import { useTagSuggestions } from '@/hooks/use-tag-suggestions';
import { useTheme } from '@/hooks/use-theme';
import { looksLikeFediverseUrl } from '@/utils/links';
import { rememberSearch, useRecentSearches } from '@/utils/recent-searches';

export default function SearchScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const column = useColumn();
  const [input, setInput] = useState('');
  // Searching resolves remote accounts and posts, so it runs on submit rather than per keystroke.
  const [query, setQuery] = useState('');
  const openUrl = useOpenUrl();
  const recent = useRecentSearches();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const run = (text: string) => {
    const value = text.trim();
    setInput(value);
    setQuery(value);
    if (value && column.web) rememberSearch(value);
  };
  const submit = (text: string) => {
    const value = text.trim();
    if (looksLikeFediverseUrl(value)) openUrl(value);
    else run(value);
  };
  const [handled, setHandled] = useState<string>();
  const param = q?.trim();
  if (param && param !== handled) {
    setHandled(param);
    setInput(param);
    setQuery(param);
  }
  useEffect(() => {
    if (param && column.web) rememberSearch(param);
  }, [param, column.web]);
  const search = useSearch(query);
  const results = search.data;

  useEffect(() => {
    if (!results) return;
    const count = results.accounts.length + results.hashtags.length + results.statuses.length;
    AccessibilityInfo.announceForAccessibility(
      count ? t('timeline.search.resultsAnnouncement', { count }) : t('timeline.search.nothingFoundAnnouncement'),
    );
  }, [results, t]);

  return (
    <View style={styles.fill}>
      {column.rail && <FeedBar title={t('timeline.tabs.search')} />}
      <ScrollView
        style={column.listStyle}
        contentContainerStyle={[styles.scroll, column.contentStyle, { paddingTop: column.tabBarInset }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {!column.web && (
          <Stack.SearchBar
            placeholder={t('timeline.search.placeholder')}
            autoCapitalize="none"
            tintColor={theme.primary}
            textColor={theme.heading}
            hintTextColor={theme.muted}
            onChangeText={({ nativeEvent }) => {
              setInput(nativeEvent.text);
              if (!nativeEvent.text.trim()) setQuery('');
            }}
            onSearchButtonPress={({ nativeEvent }) => submit(nativeEvent.text)}
            onCancelButtonPress={() => {
              setInput('');
              setQuery('');
            }}
          />
        )}
        <View
          style={[
            styles.column,
            {
              maxWidth: column.columnWidth,
              backgroundColor: column.card ? undefined : theme.page,
            },
            column.rail && styles.railColumn,
          ]}
        >
          {column.web && (
            <TextField
              value={input}
              onChangeText={(text) => {
                setInput(text);
                if (!text.trim()) setQuery('');
              }}
              onSubmitEditing={() => submit(input)}
              placeholder={t('timeline.search.placeholder')}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel={t('timeline.tabs.search')}
            />
          )}

          {search.isFetching && <ActivityIndicator color={theme.primary} accessibilityLabel={t('timeline.search.searching')} />}
          {search.isError && (
            <ThemedText themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
              {search.error.message}
            </ThemedText>
          )}

          {results && (
            <>
              {results.accounts.length > 0 && (
                <Section title={t('timeline.search.people')}>
                  {results.accounts.map((a) => (
                    <Row
                      key={a.id}
                      title={a.displayName}
                      detail={`@${a.handle}`}
                      leading={<Avatar uri={a.avatar} />}
                      chevron
                      onPress={() =>
                        router.push({
                          pathname: '/account/[id]',
                          params: { id: a.id },
                        })
                      }
                    />
                  ))}
                </Section>
              )}
              {results.hashtags.length > 0 && (
                <Section title={t('timeline.search.hashtags')}>
                  {results.hashtags.map((tag) => (
                    <Row
                      key={tag.name}
                      title={`#${tag.name}`}
                      detail={tag.following ? t('timeline.search.following') : undefined}
                      chevron
                      onPress={() =>
                        router.push({
                          pathname: '/tag/[name]',
                          params: { name: tag.name },
                        })
                      }
                    />
                  ))}
                </Section>
              )}
              {results.statuses.length > 0 && (
                <Section title={t('timeline.search.posts')}>
                  {results.statuses.map((s) => (
                    <StatusCard key={s.key} status={s} />
                  ))}
                </Section>
              )}
              {!results.accounts.length && !results.hashtags.length && !results.statuses.length && (
                <ThemedText>{t('timeline.search.nothingFound', { query })}</ThemedText>
              )}
            </>
          )}

          {!query && <Explore recent={recent} onRun={run} />}
        </View>
      </ScrollView>
    </View>
  );
}

function Explore({ recent, onRun }: { recent: ReturnType<typeof useRecentSearches>; onRun: (query: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { web } = useColumn();
  const { bookmarks, favourites, lists, tags, feeds } = useCapabilities();
  const suggestions = useTagSuggestions();
  const people = useSuggestedFollows();
  const tagRows = suggestions.items.slice(0, TAG_COUNT);

  return (
    <>
      <ThemedText themeColor="muted">{t('timeline.search.exploreHint')}</ThemedText>
      {web && recent.items.length > 0 && (
        <Section title={t('timeline.search.recent')}>
          {recent.items.map((item) => (
            <Row
              key={item}
              title={item}
              leading={
                <SymbolView
                  name={{
                    ios: 'clock.arrow.circlepath',
                    android: 'history',
                    web: 'history',
                  }}
                  size={18}
                  tintColor={theme.muted}
                />
              }
              trailing={
                <Pressable
                  onPress={() => recent.remove(item)}
                  hitSlop={Spacing.two}
                  accessibilityRole="button"
                  accessibilityLabel={t('timeline.search.removeRecent', {
                    query: item,
                  })}
                  style={({ pressed }) => [styles.remove, pressed && { opacity: Press.opacity }]}
                >
                  <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={16} tintColor={theme.muted} />
                </Pressable>
              }
              onPress={() => onRun(item)}
            />
          ))}
          <Row title={t('timeline.search.clearRecent')} onPress={recent.clear} />
        </Section>
      )}
      {people.data && people.data.length > 0 && (
        <Section title={t('timeline.search.suggestedPeople')}>
          {people.data.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </Section>
      )}
      {suggestions.kind && tagRows.length > 0 && (
        <Section title={suggestions.kind === 'trending' ? t('timeline.trending.title') : t('common.nav.followedTags')}>
          {tagRows.map((tag) => (
            <Row
              key={tag.name}
              title={`#${tag.name}`}
              detail={tag.uses === undefined ? undefined : t('timeline.trending.uses', { count: tag.uses })}
              chevron
              onPress={() =>
                router.push({
                  pathname: '/tag/[name]',
                  params: { name: tag.name },
                })
              }
            />
          ))}
        </Section>
      )}
      <Section title={t('timeline.search.browse')}>
        {bookmarks && (
          <Row
            title={t('timeline.search.bookmarks')}
            chevron
            onPress={() =>
              router.push({
                pathname: '/saved/[kind]',
                params: { kind: 'bookmarks' },
              })
            }
          />
        )}
        {favourites && (
          <Row
            title={t('timeline.search.favourites')}
            chevron
            onPress={() =>
              router.push({
                pathname: '/saved/[kind]',
                params: { kind: 'favourites' },
              })
            }
          />
        )}
        {lists && <Row title={t('timeline.search.lists')} chevron onPress={() => router.push('/lists')} />}
        {tags && <Row title={t('timeline.search.followedHashtags')} chevron onPress={() => router.push('/followed-tags')} />}
        {suggestions.kind === 'trending' && (
          <Row title={t('common.nav.trending')} chevron onPress={() => router.push('/trending')} />
        )}
        {feeds && <Row title={t('timeline.feeds.title')} chevron onPress={() => router.push('/feeds')} />}
      </Section>
    </>
  );
}

const TAG_COUNT = 5;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  column: {
    flexGrow: 1,
    width: '100%',
    padding: Spacing.three,
    gap: Spacing.four,
  },
  railColumn: {
    paddingHorizontal: 0,
  },
  remove: {
    padding: Spacing.one,
  },
});
