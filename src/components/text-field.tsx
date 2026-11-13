import type { ComponentRef, Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { textStyles } from '@/components/themed-text';
import { BorderWidth, frameless, Pill, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function TextField({ style, ...rest }: TextInputProps & { ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      selectionColor={theme.primary}
      style={[styles.input, { color: theme.heading, borderColor: theme.outline }, frameless, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    ...textStyles.input,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.four,
    borderWidth: BorderWidth.input,
    borderRadius: Pill,
  },
});
