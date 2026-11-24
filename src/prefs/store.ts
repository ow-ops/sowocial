import { createStore, useStore } from 'zustand';

import { Density, type DensityName } from '@/constants/theme';
import { readItem, writeItem } from '@/utils/kv';
import { PREFS_KEY } from '@/utils/kv-keys';

export const PREF_OPTIONS = {
  mediaAutoplay: ['always', 'wifi', 'never'],
  textSize: ['small', 'default', 'large', 'xlarge'],
  density: Object.keys(Density) as DensityName[],
  links: ['inApp', 'system'],
} as const;

export type Prefs = {
  mediaAutoplay: (typeof PREF_OPTIONS.mediaAutoplay)[number];
  alwaysShowSensitive: boolean;
  alwaysExpandWarnings: boolean;
  textSize: (typeof PREF_OPTIONS.textSize)[number];
  density: DensityName;
  links: (typeof PREF_OPTIONS.links)[number];
  haptics: boolean;
  altReminder: boolean;
  columns: boolean;
  mixedTimeline: boolean;
  highlightDirect: boolean;
};

export const PREF_DEFAULTS: Prefs = {
  mediaAutoplay: 'always',
  alwaysShowSensitive: false,
  alwaysExpandWarnings: false,
  textSize: 'default',
  density: 'comfortable',
  links: 'inApp',
  haptics: true,
  altReminder: true,
  columns: false,
  mixedTimeline: true,
  highlightDirect: true,
};

export const TEXT_SCALE: Record<Prefs['textSize'], number> = { small: 0.9, default: 1, large: 1.15, xlarge: 1.3 };

function load(): Prefs {
  try {
    const saved = JSON.parse(readItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null;
    return { ...PREF_DEFAULTS, ...saved };
  } catch {
    return PREF_DEFAULTS;
  }
}

export const prefsStore = createStore<Prefs>(load);

prefsStore.subscribe((state) => writeItem(PREFS_KEY, JSON.stringify(state)));

export const getPref = <K extends keyof Prefs>(key: K): Prefs[K] => prefsStore.getState()[key];

export const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
  prefsStore.setState({ [key]: value } as Pick<Prefs, K>);

export const usePref = <K extends keyof Prefs>(key: K): Prefs[K] => useStore(prefsStore, (state) => state[key]);

export const useDensity = () => Density[usePref('density')];
