import { useColorScheme } from 'react-native';
import { useStore } from 'zustand';

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

export function useTheme() {
  return resolvePalette(useThemeState(), useScheme());
}
