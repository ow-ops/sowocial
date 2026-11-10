import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQueryClient, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { refreshOrThrow } from '@/api/catch-up';
import { QueryState } from '@/components/query-state';
import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';
import { showError } from '@/utils/toast';

export function useRefreshColors() {
  const theme = useTheme();
  return { tintColor: theme.muted, colors: [theme.primary], progressBackgroundColor: theme.surface };
}

const SETTLE_MS = 1000;

type Props<T> = {
  query: UseInfiniteQueryResult<InfiniteData<T[]>>;
  renderItem: (item: T) => ReactElement;
  keyExtractor: (item: T) => string;
  getItemType?: (item: T) => string;
  emptyText: string;
  header?: ReactElement;
  underTabs?: boolean;
  listRef?: RefObject<FlashListRef<T> | null>;
  queryKey?: QueryKey;
  title?: string;
  onVisibleChange?: (items: T[]) => void;
  onRefresh?: () => Promise<unknown>;
};

export function InfiniteList<T>({
  query,
  renderItem,
  keyExtractor,
  getItemType,
  emptyText,
  header,
  underTabs = false,
  listRef,
  queryKey,
  title,
  onVisibleChange,
  onRefresh,
}: Props<T>) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const column = useColumn();
  const refreshColors = useRefreshColors();
  const items = query.data?.pages.flat() ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const ownRef = useRef<FlashListRef<T>>(null);
  const ref = listRef ?? ownRef;
  const firstKey = items[0] === undefined ? undefined : keyExtractor(items[0]);
  // Posts a user refresh merges at index 0 would land above the viewport, so a changed top scrolls to it.
  const refreshedFrom = useRef<{ key: string | undefined } | null>(null);

  useEffect(() => {
    if (!refreshedFrom.current || refreshedFrom.current.key === firstKey) return;
    refreshedFrom.current = null;
    const frame = requestAnimationFrame(() => ref.current?.scrollToOffset({ offset: 0, animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [firstKey, ref]);

  const refresh = async () => {
    setRefreshing(true);
    refreshedFrom.current = { key: firstKey };
    try {
      await (onRefresh ? onRefresh() : queryKey ? refreshOrThrow(queryClient, queryKey) : query.refetch({ throwOnError: true }));
    } catch (error) {
      showError(t('timeline.gaps.refreshFailed'), error instanceof Error ? error.message : undefined);
    } finally {
      setRefreshing(false);
      setTimeout(() => (refreshedFrom.current = null), SETTLE_MS);
    }
  };

  return (
    <>
      {title && <Stack.Screen options={{ title }} />}
      <FlashList
        ref={ref}
        data={items}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={({ item }) => renderItem(item)}
        onViewableItemsChanged={
          onVisibleChange && (({ viewableItems }) => onVisibleChange(viewableItems.map((v) => v.item)))
        }
        contentInsetAdjustmentBehavior="automatic"
        style={column.listStyle}
        contentContainerStyle={[column.contentStyle, underTabs && { paddingTop: column.tabBarInset }]}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            {...refreshColors}
          />
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: theme.page }]}>
            <QueryState
              pending={query.isPending}
              error={query.error}
              emptyText={emptyText}
              onRetry={() => void query.refetch()}
            />
          </View>
        }
        ListFooterComponent={
          query.isFetchingNextPage || (query.isError && items.length > 0) ? (
            <View style={[styles.footer, { backgroundColor: theme.page }]}>
              <QueryState
                pending={query.isFetchingNextPage}
                error={query.error}
                onRetry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
              />
            </View>
          ) : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.two,
  },
  footer: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
