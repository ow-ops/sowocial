import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderWidth, Pill, Press, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const HIT_SLOP = Platform.select({ android: 6, default: 4 });

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  size?: 'regular' | 'small';
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  selected?: boolean;
  role?: 'button' | 'radio' | 'togglebutton' | 'switch';
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  disabled = false,
  loading = false,
  destructive = false,
  selected,
  role = 'button',
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const theme = useTheme();
  const filled = selected ?? variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={size === 'small' ? HIT_SLOP : undefined}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: disabled || loading,
        ...(role === 'radio' || role === 'switch' ? { checked: selected } : { selected }),
      }}
      style={({ pressed }) => [
        styles.base,
        size === 'small' ? styles.small : styles.regular,
        filled
          ? { backgroundColor: theme.primary, borderColor: theme.primary }
          : { borderColor: destructive ? theme.danger : theme.outline },
        (pressed || disabled) && { opacity: Press.opacity },
      ]}>
      {loading ? (
        <ActivityIndicator color={filled ? theme.onPrimary : destructive ? theme.danger : theme.primary} />
      ) : (
        <ThemedText
          type={size === 'small' ? 'labelSmall' : 'label'}
          style={{ color: filled ? theme.onPrimary : destructive ? theme.danger : theme.heading }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BorderWidth.input,
    borderRadius: Pill,
  },
  regular: {
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.four,
  },
  small: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
  },
});
