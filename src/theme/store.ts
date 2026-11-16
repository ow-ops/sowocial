import { randomUUID } from 'expo-crypto';
import { Appearance, Platform } from 'react-native';
import { createStore } from 'zustand';

import { Colors } from '@/constants/theme';
import { readItem, writeItem } from '@/utils/kv';
import { THEME_KEY } from '@/utils/kv-keys';

import { parseThemeFile, type ThemeFile, type ThemeFileError, type ThemeKind } from './theme-file';

export type AppearanceSetting = 'system' | ThemeKind;

export const APPEARANCES: AppearanceSetting[] = ['system', 'light', 'dark'];

// The file text is the source of truth: it is what gets shared, exported and refreshed from the catalog.
export type CustomTheme = { id: string; name: string; kind: ThemeKind; css: string; source?: string };
export type CustomTweak = { id: string; name: string; css: string; enabled: boolean; source?: string };

export type ThemeChoice = Record<ThemeKind, string | null>;
// A kind left out follows the app's choice; null is the built-in theme.
export type AccountThemeChoice = Partial<ThemeChoice>;

export type ThemeState = {
  appearance: AppearanceSetting;
  themes: CustomTheme[];
  tweaks: CustomTweak[];
  selected: ThemeChoice;
  byAccount: Record<string, AccountThemeChoice>;
};

const KEY = THEME_KEY;
const EMPTY: ThemeState = { appearance: 'system', themes: [], tweaks: [], selected: { light: null, dark: null }, byAccount: {} };

function load(): ThemeState {
  try {
    const saved = JSON.parse(readItem(KEY) ?? 'null') as Partial<ThemeState> | null;
    return saved
      ? { ...EMPTY, ...saved, selected: { ...EMPTY.selected, ...saved.selected }, byAccount: saved.byAccount ?? {} }
      : EMPTY;
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

// Unsets the kinds an account can no longer use, and drops accounts left with nothing of their own.
function withoutChoices(byAccount: ThemeState['byAccount'], invalid: (kind: ThemeKind, id: string | null) => boolean) {
  return Object.fromEntries(
    Object.entries(byAccount).flatMap(([account, choice]) => {
      const kept = Object.fromEntries(
        Object.entries(choice).filter(([kind, id]) => id !== undefined && !invalid(kind as ThemeKind, id)),
      );
      return Object.keys(kept).length ? [[account, kept]] : [];
    }),
  );
}

export function saveTheme(theme: CustomTheme) {
  const state = themeStore.getState();
  const exists = state.themes.some((t) => t.id === theme.id);
  // A theme moved to the other kind can no longer fill its old slot.
  const misplaced = (kind: ThemeKind) => kind !== theme.kind;
  const selected = { ...state.selected };
  for (const kind of ['light', 'dark'] as const) {
    if (selected[kind] === theme.id && misplaced(kind)) selected[kind] = null;
  }
  set({
    ...state,
    themes: exists ? state.themes.map((t) => (t.id === theme.id ? theme : t)) : [...state.themes, theme],
    selected,
    byAccount: withoutChoices(state.byAccount, (kind, id) => id === theme.id && misplaced(kind)),
  });
}

export function removeTheme(id: string) {
  const state = themeStore.getState();
  const selected = { ...state.selected };
  for (const kind of ['light', 'dark'] as const) if (selected[kind] === id) selected[kind] = null;
  set({
    ...state,
    themes: state.themes.filter((t) => t.id !== id),
    selected,
    byAccount: withoutChoices(state.byAccount, (_, chosen) => chosen === id),
  });
}

export const selectTheme = (kind: ThemeKind, id: string | null) =>
  set({ selected: { ...themeStore.getState().selected, [kind]: id } });

export function choiceFor(state: ThemeState, account: string | null | undefined): ThemeChoice {
  const own = (account && state.byAccount[account]) || {};
  return { light: own.light !== undefined ? own.light : state.selected.light, dark: own.dark !== undefined ? own.dark : state.selected.dark };
}
const family = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase();

// Themes named alike, such as Catppuccin Latte and Catppuccin Mocha, are taken as one family's light and dark.
function partnerOf(themes: CustomTheme[], id: string, kind: ThemeKind) {
  const picked = themes.find((t) => t.id === id);
  return picked && themes.find((t) => t.kind === kind && family(t.name) === family(picked.name))?.id;
}

// `undefined` goes back to the app's theme. An account's first pick also takes the same family's other kind.
export function selectAccountTheme(account: string, kind: ThemeKind, id: string | null | undefined) {
  const state = themeStore.getState();
  const other: ThemeKind = kind === 'light' ? 'dark' : 'light';
  const partner = !state.byAccount[account] && id ? partnerOf(state.themes, id, other) : undefined;
  const next: AccountThemeChoice = { ...state.byAccount[account], ...(partner && { [other]: partner }), [kind]: id };
  if (id === undefined) delete next[kind];
  const { [account]: _, ...rest } = state.byAccount;
  set({ byAccount: Object.keys(next).length ? { ...rest, [account]: next } : rest });
}

export function clearAccountTheme(account: string) {
  const { [account]: _, ...rest } = themeStore.getState().byAccount;
  set({ byAccount: rest });
}

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

const palettes = new WeakMap<ThemeState, Record<string, Palette>>();

// Built-in colors, then the account's or the app's theme for this kind, then enabled tweaks in order.
export function resolvePalette(current: ThemeState, kind: ThemeKind, account?: string | null): Palette {
  const cached = palettes.get(current) ?? {};
  const slot = `${kind}:${account && current.byAccount[account] ? account : ''}`;
  if (cached[slot]) return cached[slot];
  const theme = current.themes.find((t) => t.id === choiceFor(current, account)[kind]);
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
  cached[slot] = palette;
  palettes.set(current, cached);
  return palette;
}
