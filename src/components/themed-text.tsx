import { useMemo } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TEXT_SCALE, usePref } from '@/prefs/store';

type TextType = 'title' | 'wordmark' | 'display' | 'name' | 'lead' | 'body' | 'input' | 'label' | 'labelSmall' | 'meta';

export type ThemedTextProps = TextProps & {
  type?: TextType;
  themeColor?: ThemeColor;
};

const maxScale: Partial<Record<TextType, number>> = { title: 1.5, wordmark: 1.5, display: 1.5, name: 1.8, lead: 3, body: 3, label: 2, labelSmall: 2, meta: 2 };

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

const scaled = (type: TextType) => type === 'body' || type === 'lead';

// The post text size applies on top of the OS font scale; the cap is divided by it so the total stays bounded.
function useTextScale(type: TextType) {
  const scale = TEXT_SCALE[usePref('textSize')];
  return scaled(type) ? scale : 1;
}

export function useTextStyle(type: TextType) {
  const scale = useTextScale(type);
  return useMemo(() => scaleStyle(type, scale), [type, scale]);
}

function scaleStyle(type: TextType, scale: number) {
  const base = textStyles[type];
  return scale === 1 ? base : { ...base, fontSize: base.fontSize! * scale, lineHeight: base.lineHeight! * scale };
}

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const scale = useTextScale(type);
  const cap = maxScale[type];
  return (
    <Text
      maxFontSizeMultiplier={cap && cap / scale}
      style={[{ color: theme[themeColor ?? defaultColor[type]] }, scaleStyle(type, scale), style]}
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
