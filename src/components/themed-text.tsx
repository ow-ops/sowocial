import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextType = 'title' | 'wordmark' | 'display' | 'name' | 'lead' | 'body' | 'input' | 'label' | 'labelSmall' | 'meta';

export type ThemedTextProps = TextProps & {
  type?: TextType;
  themeColor?: ThemeColor;
};

const maxScale: Partial<Record<TextType, number>> = { title: 1.5, wordmark: 1.5, display: 1.5, name: 1.8, label: 2, labelSmall: 2, meta: 2 };

const defaultColor: Record<TextType, ThemeColor> = {
  title: 'heading',
  wordmark: 'heading',
  display: 'heading',
  name: 'heading',
  lead: 'heading',
  body: 'text',
  input: 'heading',
  label: 'heading',
  labelSmall: 'heading',
  meta: 'muted',
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxScale[type]}
      style={[{ color: theme[themeColor ?? defaultColor[type]] }, textStyles[type], style]}
      {...rest}
    />
  );
}

export const textStyles = StyleSheet.create({
  title: {
    fontFamily: Fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.6,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 20,
    lineHeight: 44,
    letterSpacing: -0.6,
  },
  display: {
    fontFamily: Fonts.display,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -1.1,
  },
  name: {
    fontFamily: Fonts.heading,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  lead: {
    fontSize: 18,
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  labelSmall: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  meta: {
    fontSize: 14,
    lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
});
