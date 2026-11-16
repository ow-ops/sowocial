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
  clearAccountTheme,
  installThemeFile,
  removeTheme,
  resolvePalette,
  saveTheme,
  selectAccountTheme,
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

describe('account themes', () => {
  const ACCOUNT = 'account.example.social.1';
  const install = (name: string, kind: 'light' | 'dark', page: string) => {
    installThemeFile(`/* @sowocial-theme\nkind: ${kind} */ :root { --sowocial-page: ${page}; }`, name);
    return themeStore.getState().themes.at(-1)!.id;
  };

  beforeEach(() => {
    themeStore.setState({ themes: [], tweaks: [], selected: { light: null, dark: null }, byAccount: {} });
  });

  it("uses the account's theme for that account and the app's for the others", () => {
    const app = install('App', 'dark', '#101010');
    const own = install('Own', 'dark', '#202020');
    selectTheme('dark', app);
    selectAccountTheme(ACCOUNT, 'dark', own);
    expect(resolvePalette(themeStore.getState(), 'dark', ACCOUNT).page).toBe('#202020');
    expect(resolvePalette(themeStore.getState(), 'dark', 'account.other.2').page).toBe('#101010');
    expect(resolvePalette(themeStore.getState(), 'dark').page).toBe('#101010');
  });

  it('pairs the first pick with a theme of the same family for the other kind', () => {
    const latte = install('Catppuccin Latte', 'light', '#eff1f5');
    const mocha = install('Catppuccin Mocha', 'dark', '#1e1e2e');
    install('Dusk', 'dark', '#0c0a14');
    selectAccountTheme(ACCOUNT, 'light', latte);
    expect(themeStore.getState().byAccount[ACCOUNT]).toEqual({ light: latte, dark: mocha });
  });

  it("keeps following the app's other kind when no theme matches", () => {
    const dusk = install('Dusk', 'dark', '#0c0a14');
    const day = install('Day', 'light', '#ffffff');
    const night = install('Night', 'light', '#fafafa');
    selectTheme('light', day);
    selectAccountTheme(ACCOUNT, 'dark', dusk);
    expect(themeStore.getState().byAccount[ACCOUNT]).toEqual({ dark: dusk });
    selectTheme('light', night);
    expect(resolvePalette(themeStore.getState(), 'light', ACCOUNT).page).toBe('#fafafa');
  });

  it('sends a kind back to the app theme when its theme is removed or unset', () => {
    const latte = install('Catppuccin Latte', 'light', '#eff1f5');
    const mocha = install('Catppuccin Mocha', 'dark', '#1e1e2e');
    selectAccountTheme(ACCOUNT, 'light', latte);
    removeTheme(mocha);
    expect(themeStore.getState().byAccount[ACCOUNT]).toEqual({ light: latte });
    selectAccountTheme(ACCOUNT, 'light', undefined);
    expect(themeStore.getState().byAccount).toEqual({});

    selectAccountTheme(ACCOUNT, 'dark', null);
    clearAccountTheme(ACCOUNT);
    expect(themeStore.getState().byAccount).toEqual({});
  });
});
