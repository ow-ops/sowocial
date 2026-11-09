import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useStatus, useThread } from '@/api/statuses';
import { useForeignAccount } from '@/auth/session';
import { Button } from '@/components/button';
import { useRefreshColors } from '@/components/infinite-list';
import { QueryState } from '@/components/query-state';
import { StatusCard } from '@/components/status-card';
import { StatusHero } from '@/components/status-hero';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';
import { withDepth } from '@/utils/thread';

type Row =
  | { kind: 'ancestor'; status: Post; first: boolean }
  | { kind: 'hero'; status: Post; hasAncestors: boolean }
  | { kind: 'reply'; status: Post; depth: number };

export function ThreadView({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const column = useColumn();
  const refreshColors = useRefreshColors();
  const foreign = useForeignAccount();
  const status = useStatus(id);
  const thread = useThread(id);

  if (status.isError) {
    return (
      <ThemedText themeColor="muted" style={styles.message}>
        {status.error.message}
      </ThemedText>
    );
  }
  if (!status.data) return <ActivityIndicator color={theme.muted} style={styles.message} accessibilityLabel={t('status.thread.loadingPost')} />;

  const ancestors = thread.data?.ancestors ?? [];
  const rows: Row[] = [
    ...ancestors.map((s, i) => ({
      kind: 'ancestor' as const,
      status: s,
      first: i === 0,
    })),
    { kind: 'hero', status: status.data, hasAncestors: ancestors.length > 0 },
    ...withDepth(id, thread.data?.descendants ?? []).map((r) => ({
      kind: 'reply' as const,
      ...r,
    })),
  ];

  const reply = () => router.push({ pathname: '/compose', params: { replyTo: id } });

  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.status.key}
      getItemType={(r) => r.kind}
      renderItem={({ item }) => {
        if (item.kind === 'hero') return <StatusHero status={item.status} lineAbove={item.hasAncestors} />;
        if (item.kind === 'ancestor')
          return <StatusCard status={item.status} flat lineAbove={!item.first} lineBelow />;
        return <StatusCard status={item.status} flat depth={item.depth} />;
      }}
      initialScrollIndex={ancestors.length || undefined}
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
          {!thread.isPending && !thread.isError && rows.length === ancestors.length + 1 && (
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
