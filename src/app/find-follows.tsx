import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';

import { followAccounts, scanFollows, sessionName, type ScanProgress } from '@/api/cross-network';
import { useHomeSources } from '@/api/home-sources';
import { AccountRow } from '@/components/account-row';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { SegmentedControl } from '@/components/segmented-control';
import { Section } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import type { Author, Protocol } from '@/model/post';
import { chunked } from '@/utils/chunked';
import { confirmAction } from '@/utils/dialog';
import { showError } from '@/utils/toast';

type Scan = ScanProgress & { phase: 'idle' | 'scanning' | 'done' | 'failed'; error?: Error };

const IDLE: Scan = { read: 0, checked: 0, identities: 0, matches: [], phase: 'idle' };

export default function FindFollows() {
  const { t } = useTranslation();
  const theme = useTheme();
  const column = useColumn();
  const { accounts } = useHomeSources();
  const [direction, setDirection] = useState<Protocol>('ap');
  const [scan, setScan] = useState<Scan>(IDLE);
  const [following, setFollowing] = useState<{ done: number; total: number; group: boolean } | null>(null);
  const scanning = useRef<AbortController | null>(null);
  useEffect(() => () => scanning.current?.abort(), []);

  const from = accounts?.[direction];
  const to = accounts?.[direction === 'ap' ? 'bsky' : 'ap'];
  const network = (protocol: Protocol) => t(`timeline.findFollows.network.${protocol}`);

  const options: { value: Protocol; label: string }[] = [
    { value: 'ap', label: t('timeline.findFollows.fromFediverse') },
    { value: 'bsky', label: t('timeline.findFollows.fromBluesky') },
  ];

  const changeDirection = (value: Protocol) => {
    if (following) return;
    scanning.current?.abort();
    setScan(IDLE);
    setDirection(value);
  };

  const startScan = () => {
    if (!from || !to) return;
    scanning.current?.abort();
    const controller = new AbortController();
    scanning.current = controller;
    setScan({ ...IDLE, phase: 'scanning' });
    scanFollows(from, to, (progress) => setScan((s) => ({ ...s, ...progress, phase: 'scanning' })), controller.signal)
      .then((matches) => {
        setScan((s) => ({ ...s, matches, phase: 'done' }));
        AccessibilityInfo.announceForAccessibility(t('timeline.findFollows.scanDone', { count: matches.length }));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setScan((s) => ({ ...s, phase: 'failed', error: error instanceof Error ? error : undefined }));
      });
  };

  const follow = async (targets: Author[], group = false) => {
    if (!to) return;
    setFollowing({ done: 0, total: targets.length, group });
    const failed: Author[] = [];
    let firstError: Error | undefined;
    let followedCount = 0;
    for (const chunk of chunked(targets)) {
      const outcome = await followAccounts(to, chunk);
      followedCount += outcome.followed.length;
      failed.push(...outcome.failed);
      firstError ??= outcome.firstError;
      setScan((s) => ({ ...s, matches: s.matches.filter((m) => !outcome.followed.includes(m.id)) }));
      setFollowing((f) => f && { ...f, done: f.done + chunk.length });
    }
    setFollowing(null);
    if (failed.length) showError(t('timeline.findFollows.failedSome', { count: failed.length }), firstError?.message);
    else AccessibilityInfo.announceForAccessibility(t('timeline.findFollows.followDone', { count: followedCount }));
  };

  const followAll = () =>
    to &&
    confirmAction(
      t('timeline.findFollows.confirmFollowAll', { count: scan.matches.length, handle: sessionName(to) }),
      t('timeline.findFollows.followAll'),
      () => void follow(scan.matches, true),
      { destructive: false },
    );

  const header = (
    <View style={[styles.header, { backgroundColor: theme.page }]}>
      <View style={styles.inset}>
        <SegmentedControl label={t('timeline.findFollows.direction')} options={options} value={direction} onChange={changeDirection} />
      </View>
      {from && to && scan.phase === 'idle' && (
        <>
          <ThemedText style={styles.inset}>
            {t('timeline.findFollows.intro', { from: network(from.protocol), to: network(to.protocol) })}
          </ThemedText>
          <Button label={t('timeline.findFollows.scan')} onPress={startScan} />
        </>
      )}
      {scan.phase === 'scanning' && (
        <View style={[styles.progress, styles.inset]}>
          <ActivityIndicator color={theme.muted} />
          <ThemedText type="meta" style={styles.progressText} accessibilityLiveRegion="polite">
            {t('timeline.findFollows.progress', { read: scan.read, checked: scan.checked, total: scan.identities })}
          </ThemedText>
        </View>
      )}
      {scan.phase === 'failed' && (
        <View style={styles.inset}>
          <ThemedText>{t('timeline.findFollows.scanFailed')}</ThemedText>
          <QueryState pending={false} error={scan.error ?? new Error(t('common.unknownError'))} onRetry={startScan} />
        </View>
      )}
      {scan.phase === 'done' && scan.matches.length === 0 && (
        <View style={[styles.inset, styles.empty]}>
          <ThemedText>{t('timeline.findFollows.empty')}</ThemedText>
          <ThemedText type="meta" themeColor="muted">
            {t('timeline.findFollows.checked', { count: scan.read })}
          </ThemedText>
        </View>
      )}
      {scan.phase === 'done' && scan.matches.length > 0 && (
        <Section title={t('timeline.findFollows.matches', { count: scan.matches.length })}>
          <Button label={t('timeline.findFollows.followAll')} disabled={!!following} onPress={followAll} />
          {following?.group && (
            <ThemedText type="meta" accessibilityLiveRegion="polite">
              {t('timeline.findFollows.following', { done: following.done, total: following.total })}
            </ThemedText>
          )}
        </Section>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: t('timeline.more.findFollows') }} />
      <FlashList
        data={scan.phase === 'done' ? scan.matches : []}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => (
          <AccountRow
            account={item}
            trailing={
              <Button
                label={t('profile.follow.follow')}
                variant="outline"
                size="small"
                disabled={!!following}
                onPress={() => void follow([item])}
              />
            }
          />
        )}
        ListHeaderComponent={header}
        contentInsetAdjustmentBehavior="automatic"
        style={column.listStyle}
        contentContainerStyle={column.contentStyle}
        keyboardShouldPersistTaps="handled"
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  inset: {
    paddingHorizontal: Spacing.three,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  progressText: {
    flex: 1,
  },
  empty: {
    gap: Spacing.two,
  },
});
