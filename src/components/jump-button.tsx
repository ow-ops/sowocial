import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pill, Press, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function JumpButton({
  label,
  loading,
  top,
  onPress,
}: {
  label: string;
  loading: boolean;
  top: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading }}
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.button,
        { top, backgroundColor: theme.primary },
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
