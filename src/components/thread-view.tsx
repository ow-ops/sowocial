import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useStatus, useThread } from '@/api/statuses';
import { useForeignAccount } from '@/auth/session';
import { Button } from '@/components/button';
import { useRefreshColors } from '@/components/infinite-list';
import { QueryState } from '@/components/query-state';
import { StatusCard } from '@/components/status-card';
import { StatusHero } from '@/components/status-hero';
import { MissingPost, MoreReplies } from '@/components/thread-rows';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useOpenStatus } from '@/hooks/use-open-status';
import { useTheme } from '@/hooks/use-theme';
import { tapHaptic } from '@/utils/haptics';
import { buildThread } from '@/utils/thread';

export function ThreadView({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const column = useColumn();
  const refreshColors = useRefreshColors();
  const foreign = useForeignAccount();
  const status = useStatus(id);
  const thread = useThread(id);
  const open = useOpenStatus();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (status.isError) {
    return (
      <ThemedText themeColor="muted" style={styles.message}>
        {status.error.message}
      </ThemedText>
    );
  }
  if (!status.data) return <ActivityIndicator color={theme.muted} style={styles.message} accessibilityLabel={t('status.thread.loadingPost')} />;

  const rows = buildThread(
    status.data,
    thread.data?.ancestors ?? [],
    thread.data?.descendants ?? [],
    expanded,
    thread.isSuccess,
  );
  const heroIndex = rows.findIndex((r) => r.kind === 'hero');

  const reply = () => router.push({ pathname: '/compose', params: { replyTo: id } });

  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.kind}
      renderItem={({ item }) => {
        switch (item.kind) {
          case 'missing':
            return <MissingPost lineAbove={item.lineAbove} />;
          case 'hero':
            return <StatusHero status={item.status} lineAbove={item.lineAbove} part={item.part} />;
          case 'post':
            return <StatusCard status={item.status} flat lineAbove={item.lineAbove} lineBelow={item.lineBelow} part={item.part} />;
          case 'reply':
            return (
              <StatusCard
                status={item.status}
                flat
                depth={item.depth}
                rails={item.rails}
                repliesBelow={item.lineBelow}
                separator={item.separator}
                parent={item.parent}
              />
            );
          case 'more':
            return (
              <MoreReplies
                depth={item.depth}
                rails={item.rails}
                count={item.count}
                continues={item.continues}
                separator={item.separator}
                onPress={() =>
                  item.continues
                    ? open(item.parent, `/post/${item.parent.id}`)
                    : setExpanded((e) => new Set(e).add(item.parent.id))
                }
              />
            );
        }
      }}
      initialScrollIndex={heroIndex || undefined}
      contentInsetAdjustmentBehavior="automatic"
      style={column.listStyle}
      contentContainerStyle={column.contentStyle}
      ListFooterComponent={
        <View style={[styles.footer, { backgroundColor: theme.page }]}>
          <QueryState
            pending={thread.isPending}
            error={thread.error}
            pendingLabel={t('status.thread.loadingReplies')}
          />
          {!thread.isPending && !thread.isError && rows.length === heroIndex + 1 && (
            <>
              <ThemedText themeColor="muted">{t('status.thread.noReplies')}</ThemedText>
              {!foreign && <Button label={t('status.thread.reply')} size="small" variant="outline" onPress={reply} />}
            </>
          )}
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={thread.isRefetching}
          {...refreshColors}
          onRefresh={() => {
            tapHaptic();
            status.refetch();
            thread.refetch();
          }}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  message: {
    padding: Spacing.five,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    minHeight: 120,
  },
});
