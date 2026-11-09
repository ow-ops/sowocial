import { randomUUID } from 'expo-crypto';
import { Appearance, Platform } from 'react-native';
import { createStore } from 'zustand';

import { Colors } from '@/constants/theme';
import { readItem, writeItem } from '@/utils/kv';
import { THEME_KEY } from '@/utils/kv-keys';

import { parseThemeFile, type ThemeFile, type ThemeFileError, type ThemeKind } from './theme-file';

export type AppearanceSetting = 'system' | ThemeKind;

// The file text is the source of truth: it is what gets shared, exported and refreshed from the catalog.
export type CustomTheme = { id: string; name: string; kind: ThemeKind; css: string; source?: string };
export type CustomTweak = { id: string; name: string; css: string; enabled: boolean; source?: string };

export type ThemeState = {
  appearance: AppearanceSetting;
  themes: CustomTheme[];
  tweaks: CustomTweak[];
  selected: Record<ThemeKind, string | null>;
};

const KEY = THEME_KEY;
const EMPTY: ThemeState = { appearance: 'system', themes: [], tweaks: [], selected: { light: null, dark: null } };

function load(): ThemeState {
  try {
    const saved = JSON.parse(readItem(KEY) ?? 'null') as Partial<ThemeState> | null;
    return saved ? { ...EMPTY, ...saved, selected: { ...EMPTY.selected, ...saved.selected } } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export const themeStore = createStore<ThemeState>(load);

function applyAppearance({ appearance }: ThemeState) {
  if (Platform.OS !== 'web') Appearance.setColorScheme(appearance === 'system' ? 'auto' : appearance);
}
applyAppearance(themeStore.getState());

themeStore.subscribe((state) => {
  writeItem(KEY, JSON.stringify(state));
  applyAppearance(state);
});

const set = (next: Partial<ThemeState>) => themeStore.setState(next);

export const newThemeId = randomUUID;

// A file from a URL that is already installed replaces that copy.
export function installThemeFile(css: string, fallbackName: string, source?: string): ThemeFileError | null {
  const file = parseThemeFile(css);
  if (typeof file === 'string') return file;
  const state = themeStore.getState();
  const name = file.meta.name ?? fallbackName;
  if (file.type === 'theme') {
    const existing = source ? state.themes.find((t) => t.source === source) : undefined;
    saveTheme({ id: existing?.id ?? newThemeId(), name, kind: file.meta.kind!, css, source });
  } else {
    const existing = source ? state.tweaks.find((t) => t.source === source) : undefined;
    const tweak = { id: existing?.id ?? newThemeId(), name, css, enabled: existing?.enabled ?? true, source };
    set({ ...state, tweaks: [...state.tweaks.filter((t) => t.id !== tweak.id), tweak] });
  }
  return null;
}

export function saveTheme(theme: CustomTheme) {
  const state = themeStore.getState();
  const exists = state.themes.some((t) => t.id === theme.id);
  // A theme moved to the other kind can no longer fill its old slot.
  const selected = { ...state.selected };
  for (const kind of ['light', 'dark'] as const) {
    if (selected[kind] === theme.id && kind !== theme.kind) selected[kind] = null;
  }
  set({
    ...state,
    themes: exists ? state.themes.map((t) => (t.id === theme.id ? theme : t)) : [...state.themes, theme],
    selected,
  });
}

export function removeTheme(id: string) {
  const state = themeStore.getState();
  const selected = { ...state.selected };
  for (const kind of ['light', 'dark'] as const) if (selected[kind] === id) selected[kind] = null;
  set({ ...state, themes: state.themes.filter((t) => t.id !== id), selected });
}

export const selectTheme = (kind: ThemeKind, id: string | null) =>
  set({ selected: { ...themeStore.getState().selected, [kind]: id } });

export const setAppearance = (appearance: AppearanceSetting) => set({ appearance });

export const setTweakEnabled = (id: string, enabled: boolean) =>
  set({ tweaks: themeStore.getState().tweaks.map((t) => (t.id === id ? { ...t, enabled } : t)) });

export const removeTweak = (id: string) => set({ tweaks: themeStore.getState().tweaks.filter((t) => t.id !== id) });

// Parsing is cached by file text, so resolving a palette stays cheap on every render.
const parsed = new Map<string, ThemeFile | null>();
function fileOf(css: string) {
  if (!parsed.has(css)) {
    const file = parseThemeFile(css);
    parsed.set(css, typeof file === 'string' ? null : file);
  }
  return parsed.get(css)!;
}

export type Palette = Record<keyof typeof Colors.dark, string>;

// One theme's colors over the built-in ones, for previews and swatches.
export function themeColors(css: string, kind: ThemeKind): Palette {
  const tokens = fileOf(css)?.tokens;
  return { ...Colors[kind], ...(kind === 'light' && !tokens?.shadow && { shadow: tokens?.heading ?? Colors.light.heading }), ...tokens };
}

const palettes = new WeakMap<ThemeState, Partial<Record<ThemeKind, Palette>>>();

// Built-in colors, then the selected theme for this kind, then enabled tweaks in order.
export function resolvePalette(current: ThemeState, kind: ThemeKind): Palette {
  const cached = palettes.get(current) ?? {};
  if (cached[kind]) return cached[kind];
  const theme = current.themes.find((t) => t.id === current.selected[kind]);
  const layers = [theme?.css, ...current.tweaks.filter((t) => t.enabled).map((t) => t.css)];
  const palette: Palette = { ...Colors[kind] };
  let customShadow = false;
  for (const css of layers) {
    const file = css ? fileOf(css) : null;
    if (file && (file.type === 'theme' || !file.meta.kind || file.meta.kind === kind)) {
      Object.assign(palette, file.tokens);
      customShadow ||= !!file.tokens.shadow;
    }
  }
  if (!customShadow && kind === 'light') palette.shadow = palette.heading;
  cached[kind] = palette;
  palettes.set(current, cached);
  return palette;
}
