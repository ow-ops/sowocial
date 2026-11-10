import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { catchUp, useFillGap, type GapSource } from '@/api/catch-up';
import { Button } from '@/components/button';
import { Spacing } from '@/constants/theme';
import type { Post } from '@/model/post';

export function useGaps(source: GapSource | undefined, card: (post: Post) => ReactElement) {
  const queryClient = useQueryClient();
  const fill = useFillGap(source);
  return {
    renderItem: (post: Post) => (
      <>
        {card(post)}
        {source && post.gap && (
          <GapRow loading={fill.isPending && fill.variables?.key === post.key} onPress={() => fill.mutate(post)} />
        )}
      </>
    ),
    onRefresh: source && (() => catchUp(queryClient, source, { silent: false })),
  };
}

function GapRow({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Button
        label={t('timeline.gaps.load')}
        variant="outline"
        size="small"
        loading={loading}
        onPress={onPress}
        accessibilityHint={t('timeline.gaps.hint')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingVertical: Spacing.three },
});
