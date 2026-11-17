import { FlashList } from '@shopify/flash-list';
import type { AppBskyGraphDefs } from '@atproto/api';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useListMembers } from '@/api/lists';
import { listId } from '@/api/bsky/lists';
import { starterPackName, starterPackRecord, useDeleteStarterPack, useFollowMembers, useStarterPack } from '@/api/bsky/starter-packs';
import { useAuthedSession } from '@/auth/session';
import { AccountRow } from '@/components/account-row';
import { Button } from '@/components/button';
import { FeedRow } from '@/components/feed-row';
import { useRefreshColors } from '@/components/infinite-list';
import { QueryState } from '@/components/query-state';
import { Section, SectionTitle, SettingsScreen } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/utils/dialog';
import { tapHaptic } from '@/utils/haptics';
import { showError, showToast } from '@/utils/toast';

export default function StarterPackScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useStarterPack(id);
  if (!query.data) {
    return (
      <SettingsScreen title={t('profile.starterPacks.title')}>
        <QueryState pending={query.isPending} error={query.error} onRetry={() => query.refetch()} />
      </SettingsScreen>
    );
  }
  return <StarterPackBody pack={query.data} refetchPack={query.refetch} />;
}

function StarterPackBody({ pack, refetchPack }: { pack: AppBskyGraphDefs.StarterPackView; refetchPack: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const column = useColumn();
  const refreshColors = useRefreshColors();
  const { accountId } = useAuthedSession();
  const list = pack.list && listId(pack.list.uri);
  const members = useListMembers(list ?? '');
  const [refreshing, setRefreshing] = useState(false);
  const owner = pack.creator.did === accountId;

  const refresh = async () => {
    tapHaptic();
    setRefreshing(true);
    try {
      await Promise.all([refetchPack(), list ? members.refetch() : undefined]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('profile.starterPacks.title') }} />
      <FlashList
        data={list ? (members.data ?? []) : []}
        keyExtractor={(member) => member.id}
        renderItem={({ item }) => <AccountRow account={item} />}
        contentInsetAdjustmentBehavior="automatic"
        style={column.listStyle}
        contentContainerStyle={column.contentStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} {...refreshColors} />}
        ListHeaderComponent={<Header pack={pack} list={list} count={members.data?.length} owner={owner} />}
        ListEmptyComponent={
          <View style={[styles.state, { backgroundColor: theme.page }]}>
            <QueryState
              pending={!!list && members.isPending}
              error={list ? members.error : null}
              emptyText={t('profile.starterPacks.noPeople')}
              onRetry={() => void members.refetch()}
            />
          </View>
        }
        ListFooterComponent={owner ? <Footer pack={pack} /> : null}
      />
    </>
  );
}

function Header({ pack, list, count, owner }: { pack: AppBskyGraphDefs.StarterPackView; list?: string; count?: number; owner: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const name = starterPackName(pack);
  const description = starterPackRecord(pack)?.description;

  return (
    <View style={[styles.header, { backgroundColor: theme.page }]}>
      <View>
        <ThemedText type="title" selectable>
          {name}
        </ThemedText>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/account/[id]', params: { id: pack.creator.did } })}
          style={styles.creator}>
          <ThemedText type="meta" themeColor="primary">
            {t('profile.starterPacks.by', { handle: pack.creator.handle })}
          </ThemedText>
        </Pressable>
      </View>

      {description && <ThemedText selectable>{description}</ThemedText>}

      {list && !!count && <FollowAll list={list} />}
      {owner && list && (
        <Button
          label={t('profile.starterPacks.editMembers')}
          variant="outline"
          onPress={() => router.push({ pathname: '/lists/manage/[id]', params: { id: list } })}
        />
      )}

      {pack.feeds && pack.feeds.length > 0 && (
        <Section title={t('profile.starterPacks.feeds')}>
          {pack.feeds.map((feed) => <FeedRow key={feed.uri} view={feed} pathname="/feeds/info/[id]" />)}
        </Section>
      )}

      <SectionTitle title={t('profile.starterPacks.people')} />
    </View>
  );
}

function FollowAll({ list }: { list: string }) {
  const { t } = useTranslation();
  const follow = useFollowMembers(list);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const run = () => {
    setProgress({ done: 0, total: 0 });
    follow.mutate((done, total) => setProgress({ done, total }), {
      onSuccess: (count) => showToast(count > 0 ? t('profile.starterPacks.followAll.done', { count }) : t('profile.starterPacks.followAll.none')),
      onError: (e) => showError(t('profile.starterPacks.followAll.failed'), e.message),
    });
  };

  return (
    <View style={styles.followAll}>
      <Button
        label={t('profile.starterPacks.followAll.action')}
        loading={follow.isPending}
        onPress={() => confirmAction(t('profile.starterPacks.followAll.confirm'), t('profile.starterPacks.followAll.action'), run, { destructive: false })}
      />
      {follow.isPending && (
        <ThemedText type="meta" accessibilityLiveRegion="polite">
          {t('profile.starterPacks.followAll.progress', progress)}
        </ThemedText>
      )}
    </View>
  );
}

function Footer({ pack }: { pack: AppBskyGraphDefs.StarterPackView }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const remove = useDeleteStarterPack();
  const name = starterPackName(pack);

  return (
    <View style={[styles.footer, { backgroundColor: theme.page }]}>
      <Button
        label={t('profile.starterPacks.delete')}
        variant="outline"
        destructive
        loading={remove.isPending}
        onPress={() =>
          confirmAction(t('profile.starterPacks.deleteConfirm', { name }), t('common.delete'), () =>
            remove.mutate(pack, {
              onSuccess: () => router.dismissTo('/lists'),
              onError: (e) => showError(t('profile.starterPacks.deleteFailed'), e.message),
            }),
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  creator: {
    alignSelf: 'flex-start',
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
  followAll: {
    gap: Spacing.two,
  },
  state: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.five,
  },
  footer: {
    padding: Spacing.three,
    paddingTop: Spacing.five,
  },
});
