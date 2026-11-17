import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { DismissiblePill } from '@/components/dismissible-pill';
import { ThemedText } from '@/components/themed-text';
import { Pill, Press, Shadow, Spacing } from '@/constants/theme';
import type { PillPosition } from '@/hooks/use-pill-position';
import { useTheme } from '@/hooks/use-theme';

export function JumpButton({
  label,
  loading,
  position,
  hidden,
  onPress,
  onDismiss,
}: {
  label: string;
  loading: boolean;
  position: PillPosition;
  hidden: boolean;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  return (
    <DismissiblePill position={position} hidden={hidden} onDismiss={onDismiss}>
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
    </DismissiblePill>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Pill,
    boxShadow: Shadow.raised,
  },
});
