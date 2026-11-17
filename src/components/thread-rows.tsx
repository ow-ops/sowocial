import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { replyInset, ThreadLine, ThreadRails, underPostPadding } from '@/components/thread-line';
import { Hairline, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDensity } from '@/prefs/store';

export function MissingPost({ lineAbove }: { lineAbove: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { padding, avatar } = useDensity();
  return (
    <View style={[styles.missing, { paddingLeft: padding + avatar + Spacing.oneHalf, backgroundColor: theme.page }]}>
      <ThreadLine center={padding + avatar / 2} top={lineAbove ? 0 : padding} bottom={0} />
      <ThemedText type="meta">{t('status.thread.unavailable')}</ThemedText>
    </View>
  );
}

type MoreProps = {
  depth: number;
  rails: boolean[];
  count: number;
  continues: boolean;
  separator: boolean;
  underPost?: boolean;
  onPress: () => void;
};

export function MoreReplies({ depth, rails, count, continues, separator, underPost = false, onPress }: MoreProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { padding: base, avatar } = useDensity();
  const padding = underPost ? underPostPadding(base, avatar) : base;
  const label = continues ? t('status.thread.continueThread', { count }) : t('status.thread.moreReplies', { count });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed, hovered }) => [
        styles.more,
        {
          paddingLeft: replyInset(depth, padding, avatar),
          paddingRight: base,
          backgroundColor: pressed || hovered ? theme.surface : theme.page,
        },
        separator && { borderBottomWidth: Hairline, borderBottomColor: theme.border },
      ]}>
      <ThreadRails depth={depth} rails={rails} anchor={TouchTarget / 2} padding={padding} avatar={avatar} />
      <ThemedText type="label" themeColor="primary" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  missing: {
    justifyContent: 'center',
    minHeight: TouchTarget,
  },
  more: {
    justifyContent: 'center',
    minHeight: TouchTarget,
  },
});
