import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { PENDING_LIMIT } from '@/api/pending';
import { ThemedText } from '@/components/themed-text';
import { Pill, Press, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function NewPostsButton({
  count,
  more = false,
  top,
  onPress,
}: {
  count: number;
  more?: boolean;
  top: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (count === 0) return null;
  const amount = count >= PENDING_LIMIT ? `${PENDING_LIMIT}+` : more ? `${count}+` : count;
  const label = t('timeline.newPosts.label', { count, amount });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('timeline.newPosts.hint')}
      accessibilityLiveRegion="polite"
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.button,
        { top, backgroundColor: theme.primary },
        pressed && { opacity: Press.opacity },
      ]}>
      <ThemedText type="label" style={{ color: theme.onPrimary }}>
        ↑ {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Pill,
    boxShadow: Shadow.raised,
  },
});
