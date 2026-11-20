import { Platform, StyleSheet } from 'react-native';

// Dark values are the ow-ops tokens (ow-ops-site/src/styles/tokens.css); light is derived from the same hues.
export const Colors = {
  dark: {
    canvas: '#06050b',
    page: '#0c0a14',
    surface: '#1a1526',
    border: '#221c2e',
    outline: '#6a6376',
    shadow: '#000000',
    text: '#c5bfd1',
    heading: '#ece6f0',
    muted: '#9a93a6',
    primary: '#c8b8ec',
    onPrimary: '#0c0a14',
    danger: '#f0a3b5',
    fediverse: '#7fd1b9',
    bluesky: '#8ab4f8',
  },
  light: {
    canvas: '#e4def0',
    page: '#f8f6fb',
    surface: '#efebf5',
    border: '#e0d9ea',
    outline: '#867f94',
    shadow: '#16121f',
    text: '#3d364a',
    heading: '#16121f',
    muted: '#675f75',
    primary: '#6b4fb8',
    onPrimary: '#f8f6fb',
    danger: '#a93557',
    fediverse: '#187059',
    bluesky: '#1d5fb8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.dark;

// Embedded by the expo-font config plugin. iOS resolves fonts by PostScript name,
// Android by file name; web loads the same files with useFonts under the file names.
export const Fonts = Platform.select({
  ios: { display: 'BricolageGrotesque-Bold', heading: 'BricolageGrotesque-SemiBold', mono: 'Menlo' },
  default: { display: 'BricolageGrotesque_700Bold', heading: 'BricolageGrotesque_600SemiBold', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  oneHalf: 12,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Pill = 999;

export const Radius = { sm: 6, md: 12, lg: 16 } as const;

export const Hairline = StyleSheet.hairlineWidth;

export const BorderWidth = { hairline: Hairline, input: 1 } as const;

export const Outlined = { borderWidth: Hairline, borderRadius: Radius.md, borderCurve: 'continuous' } as const;

export const Overlay = { scrim: 'rgba(0,0,0,0.6)', onScrim: '#fff', swatchEdge: 'rgba(127,127,127,0.4)' } as const;

export const Shadow = {
  raised: '0 2px 8px rgba(0, 0, 0, 0.2)',
  overlay: '0 4px 12px rgba(0, 0, 0, 0.3)',
} as const;

export const Press = { opacity: 0.7, disabled: 0.4 } as const;

export const TouchTarget = 48;

// Single centered column on wide screens, as in Phanpy (40em).
export const ColumnWidth = 640;
export const ColumnWidthExpanded = 720;
// One column of the web columns layout.
export const DeckColumnWidth = 400;

export const WindowClass = { medium: 600, expanded: 840, rail: 1024 } as const;

export const RailWidth = 248;



const MediaMaxHeight = 320;

export const Density = {
  comfortable: { avatar: 50, padding: Spacing.three, gap: Spacing.two, mediaMaxHeight: MediaMaxHeight, capMedia: false },
  compact: { avatar: 40, padding: Spacing.oneHalf, gap: Spacing.one, mediaMaxHeight: 240, capMedia: true },
} as const;
export type DensityName = keyof typeof Density;

export const ListPaneWidth = 400;

export const MinSplitHeight = 480;

// Frameless text fields: the caret marks focus, so drop the browser's focus ring on web.
export const frameless = Platform.select({
  web: { outlineStyle: 'solid', outlineWidth: 0 } as const,
  default: {},
});
