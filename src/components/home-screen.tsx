import type { FlashListRef } from '@shopify/flash-list';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  mixedPendingId,
  accountHomeSource,
  mixedSource,
  setHomeAccount,
  setHomeSource,
  showMixedPending,
  useAccountHome,
  useAccountHomeCatchUp,
  useHomeSources,
  useMixedPolling,
  useMixedTimeline,
  type HomeSource,
} from '@/api/home-sources';
import { keys } from '@/api/keys';
import type { Source } from '@/api/mixed';
import { refreshFirstPage } from '@/api/pagination';
import { usePendingById } from '@/api/pending';
import { useTimeline } from '@/api/timelines';
import { useSessionProfile } from '@/api/accounts';
import { accountKey } from '@/auth/account-key';
import { useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { useReconnect } from '@/auth/use-reconnect';
import { Button } from '@/components/button';
import { ComposeFab } from '@/components/compose-fab';
import { FeedBar } from '@/components/feed-bar';
import { useGaps } from '@/components/gap-row';
import { Avatar } from '@/components/avatar';
import { InfiniteList } from '@/components/infinite-list';
import { NativeMenu } from '@/components/native-menu';
import { NewPostsButton } from '@/components/new-posts-button';
import { SegmentedControl } from '@/components/segmented-control';
import { NetworkGlyph, networkColor, sessionHandle, useAccountSource } from '@/components/source-badge';
import { StatusCard } from '@/components/status-card';
import { LiveStatusList } from '@/components/status-list';
import { ThemedText } from '@/components/themed-text';
import { TimelineScreen } from '@/components/timeline-screen';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { usePillPosition } from '@/hooks/use-pill-position';
import { useScrollToNew } from '@/hooks/use-scroll-to-new';
import { useScrolling } from '@/hooks/use-scrolling';
import type { Post } from '@/model/post';
import { useStatusListShortcuts } from '@/shortcuts/use-status-list-shortcuts';
import { readItem, writeItem } from '@/utils/kv';
import { MIXED_EXPLAINED_KEY } from '@/utils/kv-keys';
import { joinedLines } from '@/utils/timeline';

const EXPLAINED_KEY = MIXED_EXPLAINED_KEY;

function statusType(s: Post) {
  const kind = s.contentWarning ? 'cw' : s.poll ? 'poll' : s.media.length > 0 ? 'media' : 'text';
  return `${s.gap ? 'gap-' : ''}${s.repostedBy ? 'reblog-' : ''}${(s.filters ?? []).length > 0 ? 'filtered' : kind}`;
}

const foreignItem = { renderItem: (s: Post) => <StatusCard status={s} {...joinedLines(s)} /> };

const mixedItem = {
  keyExtractor: (s: Post) => s.key,
  getItemType: statusType,
  renderItem: (s: Post) => <StatusCard status={s} showSource {...joinedLines(s)} />,
};

export function HomeScreen() {
  const { accounts, source, active } = useHomeSources();
  const { rail } = useColumn();
  if (!accounts) return <TimelineScreen timeline="home" />;
  const { ap, bsky } = accounts;
  const own = (protocol: 'ap' | 'bsky') => (protocol === 'ap' ? ap : bsky);
  const bar = rail ? <HomeBar ap={ap} bsky={bsky} source={source} /> : undefined;
  const header = bar ? undefined : <SourceSwitch ap={ap} bsky={bsky} source={source} />;
  return (
    <View style={styles.fill}>
      {source === 'mixed' ? (
        <MixedHome ap={ap} bsky={bsky} source={source} />
      ) : accountKey(own(source)) === active ? (
        <ActiveHome header={header} bar={bar} />
      ) : (
        <ForeignHome session={own(source)} header={header} bar={bar} />
      )}
      {!rail && <ComposeFab />}
    </View>
  );
}

function HomeBar({ ap, bsky, source, failed }: { ap: Session; bsky: Session; source: HomeSource; failed?: Source[] }) {
  const { t } = useTranslation();
  return (
    <FeedBar title={t('timeline.tabs.home')}>
      <SourceSwitch ap={ap} bsky={bsky} source={source} failed={failed} inline />
    </FeedBar>
  );
}

function ActiveHome({ header, bar }: { header?: ReactElement; bar?: ReactElement }) {
  const { t } = useTranslation();
  return (
    <View style={styles.fill}>
      {bar}
      <LiveStatusList timeline="home" underTabs query={useTimeline('home')} header={header} emptyText={t('timeline.home.empty')} />
    </View>
  );
}

function ForeignHome({ session, header, bar }: { session: Session; header?: ReactElement; bar?: ReactElement }) {
  const { t } = useTranslation();
  const query = useAccountHome(session);
  useAccountHomeCatchUp(session);
  const gaps = useGaps(accountHomeSource(session), foreignItem.renderItem);
  const listRef = useRef<FlashListRef<Post>>(null);
  useStatusListShortcuts(query.data?.pages.flat() ?? [], listRef);
  return (
    <View style={styles.fill}>
      {bar}
      <InfiniteList
        query={query}
        queryKey={keys.accountHome(accountKey(session))}
        listRef={listRef}
        header={header}
        underTabs
        emptyText={t('timeline.home.empty')}
        keyExtractor={(s: Post) => s.key}
        getItemType={statusType}
        {...gaps}
      />
    </View>
  );
}

function MixedHome({ ap, bsky, source }: { ap: Session; bsky: Session; source: HomeSource }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const column = useColumn();
  const apKey = accountKey(ap);
  const bskyKey = accountKey(bsky);
  const query = useMixedTimeline(ap, bsky);
  const listRef = useRef<FlashListRef<Post>>(null);
  const gaps = useGaps(mixedSource(apKey, bskyKey), mixedItem.renderItem);
  useMixedPolling(apKey, bskyKey);
  const items = query.data?.pages.flat() ?? [];
  const showNew = useScrollToNew(listRef, items[0]?.key, () => void showMixedPending(queryClient, apKey, bskyKey));
  useStatusListShortcuts(items, listRef, showNew);

  const pill = usePillPosition(true);
  const scroll = useScrolling();
  const waiting = usePendingById(mixedPendingId(apKey, bskyKey));
  const shown = new Set(query.data?.pages.flat().map((s) => s.key));
  const count = waiting.filter((s) => !shown.has(s.key)).length;

  return (
    <View style={styles.fill}>
      {column.rail && <HomeBar ap={ap} bsky={bsky} source={source} failed={query.data?.failed} />}
      <View style={styles.fill}>
        <InfiniteList
          query={query}
          queryKey={keys.mixedTimeline(apKey, bskyKey)}
          listRef={listRef}
          underTabs
          emptyText={t('timeline.home.empty')}
          header={
            <>
              {!column.rail && <SourceSwitch ap={ap} bsky={bsky} source={source} failed={query.data?.failed} />}
              <MixedExplainer ap={ap} bsky={bsky} />
              {!query.isFetching &&
                (query.data?.failed ?? []).map((failed) => (
                  <SourceError
                    key={failed}
                    session={failed === 'ap' ? ap : bsky}
                    onRetry={() =>
                      void ((query.data?.pages.length ?? 0) <= 1
                        ? refreshFirstPage(queryClient, keys.mixedTimeline(apKey, bskyKey))
                        : query.fetchNextPage())
                    }
                  />
                ))}
            </>
          }
          {...mixedItem}
          {...gaps}
          onScroll={scroll.onScroll}
        />
        <NewPostsButton
          count={count}
          position={pill}
          hidden={scroll.scrolling}
          onPress={showNew}
        />
      </View>
    </View>
  );
}

const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener);
const isOnline = () => onlineManager.isOnline();

function MixedExplainer({ ap, bsky }: { ap: Session; bsky: Session }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => readItem(EXPLAINED_KEY) === '1');
  const apHandle = useAccountSource(true, accountKey(ap))?.handle ?? '';
  const bskyHandle = useAccountSource(true, accountKey(bsky))?.handle ?? '';
  if (dismissed) return null;

  return (
    <View style={styles.error}>
      <ThemedText type="meta" themeColor="muted" style={styles.errorText}>
        {t('timeline.mixed.explainer', { ap: apHandle, bsky: bskyHandle })}
      </ThemedText>
      <Button
        label={t('timeline.mixed.explainerDismiss')}
        variant="outline"
        onPress={() => {
          writeItem(EXPLAINED_KEY, '1');
          setDismissed(true);
        }}
      />
    </View>
  );
}

function SourceError({ session, onRetry }: { session: Session; onRetry: () => void }) {
  const { t } = useTranslation();
  const { reconnect: expired } = useSession();
  const reconnect = useReconnect();
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const key = accountKey(session);
  const handle = useAccountSource(true, key)?.handle ?? session.acct ?? '';
  const needsReconnect = expired.has(key);
  const cause = needsReconnect ? 'expired' : online ? null : 'offline';

  return (
    <View style={styles.error} accessibilityRole="alert">
      <ThemedText themeColor="danger" style={styles.errorText}>
        {[t('timeline.mixed.failed', { handle }), cause && t(`timeline.mixed.cause.${cause}`)].filter(Boolean).join(' ')}
      </ThemedText>
      {needsReconnect ? (
        <Button label={t('auth.session.reconnectAction')} loading={reconnect.isPending} onPress={() => reconnect.mutate(session)} />
      ) : (
        <Button label={t('common.retry')} variant="outline" onPress={onRetry} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  switch: { padding: Spacing.three, gap: Spacing.one },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: TouchTarget },
  handle: { flexShrink: 1 },
  error: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  errorText: { flex: 1 },
});

function SourceSwitch({
  ap,
  bsky,
  source,
  failed = [],
  inline = false,
}: {
  ap: Session;
  bsky: Session;
  source: HomeSource;
  failed?: Source[];
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const { reconnect, session } = useSession();
  const { mixed } = useHomeSources();
  // The active account's network always shows that account; the other network's account can be chosen.
  const other = session?.protocol === 'ap' ? bsky : ap;
  const problem = (protocol: Source) => failed.includes(protocol) || reconnect.has(accountKey(protocol === 'ap' ? ap : bsky));
  const option = (value: HomeSource, broken: boolean) => {
    const label = t(`timeline.mixed.${value}`);
    return { value, label, alert: broken ? t('timeline.mixed.segmentProblem', { label }) : undefined };
  };
  return (
    <View style={inline ? styles.inline : styles.switch}>
      <SegmentedControl<HomeSource>
        label={t('timeline.mixed.source')}
        value={source}
        onChange={setHomeSource}
        options={[
          option('ap', problem('ap')),
          option('bsky', problem('bsky')),
          ...(mixed ? [option('mixed', problem('ap') || problem('bsky'))] : []),
        ]}
      />
      {(source === 'mixed' || source === other.protocol) && <HomeAccountPicker current={other} />}
    </View>
  );
}

function HomeAccountPicker({ current }: { current: Session }) {
  const { t } = useTranslation();
  const { sessions } = useSession();
  const avatar = useSessionProfile(current).data?.avatar;
  const choices = sessions.filter((s) => s.protocol === current.protocol);
  if (choices.length < 2) return null;
  const currentKey = accountKey(current);
  const network = t(`auth.network.${current.protocol}`);
  const handle = sessionHandle(current);

  return (
    <NativeMenu
      label={t('timeline.mixed.accountTitle', { network })}
      trigger="text"
      groups={[
        {
          key: 'own',
          items: choices.map((s) => ({
            key: accountKey(s),
            title: sessionHandle(s),
            icon: accountKey(s) === currentKey ? 'checkmark' : 'person.crop.circle',
            onPress: () => setHomeAccount(s),
          })),
        },
      ]}
      renderTrigger={(open) => (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={t('timeline.mixed.accountLabel', { network, handle })}
          style={styles.account}>
          {avatar ? <Avatar uri={avatar} size={20} /> : <NetworkGlyph protocol={current.protocol} />}
          <ThemedText type="meta" themeColor={networkColor(current.protocol)}>
            {network}
          </ThemedText>
          <ThemedText type="meta" numberOfLines={1} style={styles.handle}>
            {handle}
          </ThemedText>
          <ThemedText type="meta" themeColor="primary">
            {t('timeline.mixed.accountChange')}
          </ThemedText>
        </Pressable>
      )}
    />
  );
}
