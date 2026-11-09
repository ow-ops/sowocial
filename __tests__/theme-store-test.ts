let mockNextId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${mockNextId++}` }));

jest.mock('@/utils/kv', () => {
  const items = new Map<string, string>();
  return {
    readItem: (key: string) => items.get(key) ?? null,
    writeItem: (key: string, value: string) => void items.set(key, value),
  };
});

import { Colors } from '@/constants/theme';
import {
  installThemeFile,
  resolvePalette,
  saveTheme,
  selectTheme,
  setTweakEnabled,
  themeStore,
} from '@/theme/store';

describe('resolvePalette', () => {
  it('layers the selected theme and enabled tweaks over the built-in colors', () => {
    installThemeFile('/* @sowocial-theme\nkind: dark */ :root { --sowocial-page: #111111; }', 'Dark');
    installThemeFile('/* @sowocial-tweak */ :root { --sowocial-primary: #ff0000; }', 'Red');
    installThemeFile('/* @sowocial-tweak\nkind: light */ :root { --sowocial-muted: #00ff00; }', 'Light only');
    const [theme] = themeStore.getState().themes;
    selectTheme('dark', theme.id);

    const dark = resolvePalette(themeStore.getState(), 'dark');
    expect(dark).toEqual({ ...Colors.dark, page: '#111111', primary: '#ff0000' });
    expect(resolvePalette(themeStore.getState(), 'light')).toEqual({
      ...Colors.light,
      primary: '#ff0000',
      muted: '#00ff00',
    });

    setTweakEnabled(themeStore.getState().tweaks[0].id, false);
    expect(resolvePalette(themeStore.getState(), 'dark').primary).toBe(Colors.dark.primary);
  });

  it('replaces a catalog theme installed again from the same source', () => {
    const source = 'https://themes.example/a.sowocial.css';
    installThemeFile('/* @sowocial-theme */ :root { --sowocial-page: #fff; }', 'A', source);
    installThemeFile('/* @sowocial-theme */ :root { --sowocial-page: #eee; }', 'A', source);
    expect(themeStore.getState().themes.filter((t) => t.source === source)).toHaveLength(1);
  });
});

describe('saveTheme', () => {
  it('frees the old slot when a theme changes kind', () => {
    installThemeFile('/* @sowocial-theme\nkind: dark */ :root { --sowocial-page: #222222; }', 'Moving');
    const theme = themeStore.getState().themes.at(-1)!;
    selectTheme('dark', theme.id);
    saveTheme({ ...theme, kind: 'light' });
    expect(themeStore.getState().selected.dark).toBeNull();
  });
});
