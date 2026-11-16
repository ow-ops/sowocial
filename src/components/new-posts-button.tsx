import { useTranslation } from 'react-i18next';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { PENDING_LIMIT } from '@/api/pending';
import { ThemedText } from '@/components/themed-text';
import { Pill, Press, Shadow, Spacing } from '@/constants/theme';
import type { PillPosition } from '@/hooks/use-pill-position';
import { useTheme } from '@/hooks/use-theme';

export function NewPostsButton({
  count,
  more = false,
  position,
  onPress,
}: {
  count: number;
  more?: boolean;
  position: PillPosition;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (count === 0) return null;
  const amount = count >= PENDING_LIMIT ? `${PENDING_LIMIT}+` : more ? `${count}+` : count;
  const label = t('timeline.newPosts.label', { count, amount });
  return (
    <Animated.View style={[styles.position, position]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('timeline.newPosts.hint')}
        accessibilityLiveRegion="polite"
        hitSlop={Spacing.two}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.primary },
          pressed && { opacity: Press.opacity },
        ]}>
        <ThemedText type="label" style={{ color: theme.onPrimary }}>
          ↑ {label}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    alignSelf: 'center',
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Pill,
    boxShadow: Shadow.raised,
  },
});
