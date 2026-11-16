import { useColorScheme } from 'react-native';
import { useStore } from 'zustand';

import { useActiveAccountKey } from '@/auth/active-account';
import { resolvePalette, themeStore } from '@/theme/store';
import type { ThemeKind } from '@/theme/theme-file';

export function useThemeState() {
  return useStore(themeStore);
}

// The appearance setting wins over the system; on native it is also passed to Appearance.
export function useScheme(): ThemeKind {
  const system = useColorScheme();
  const { appearance } = useThemeState();
  if (appearance !== 'system') return appearance;
  return system === 'light' ? 'light' : 'dark';
}

// An account's own primary color, or undefined when it follows the app's theme.
export function useAccountColor(account: string | undefined) {
  const state = useThemeState();
  const scheme = useScheme();
  return account && state.byAccount[account] ? resolvePalette(state, scheme, account).primary : undefined;
}

// The active account's, not the acting one's, so a screen never recolors mid-way.
export function useTheme() {
  return resolvePalette(useThemeState(), useScheme(), useActiveAccountKey());
}
