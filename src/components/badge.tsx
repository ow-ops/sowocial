import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Hairline, Overlay, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  variant?: 'outline' | 'scrim';
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Badge({ variant = 'outline', children, style, accessibilityLabel }: Props) {
  const theme = useTheme();
  const scrim = variant === 'scrim';
  return (
    <View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        scrim
          ? { backgroundColor: Overlay.scrim }
          : { backgroundColor: theme.page, borderColor: theme.border, borderWidth: Hairline },
        style,
      ]}>
      {typeof children === 'string' ? (
        <ThemedText type="meta" style={scrim && styles.onScrim}>
          {children}
        </ThemedText>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
  },
  onScrim: {
    color: Overlay.onScrim,
  },
});
