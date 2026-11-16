import { ActivityIndicator, Animated, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pill, Press, Shadow, Spacing } from '@/constants/theme';
import type { PillPosition } from '@/hooks/use-pill-position';
import { useTheme } from '@/hooks/use-theme';

export function JumpButton({
  label,
  loading,
  position,
  onPress,
}: {
  label: string;
  loading: boolean;
  position: PillPosition;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Animated.View style={[styles.position, position]}>
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: loading }}
        hitSlop={Spacing.two}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.primary },
          pressed && { opacity: Press.opacity },
        ]}>
        {loading ? (
          <ActivityIndicator color={theme.onPrimary} />
        ) : (
          <ThemedText type="label" style={{ color: theme.onPrimary }}>
            ↓ {label}
          </ThemedText>
        )}
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
