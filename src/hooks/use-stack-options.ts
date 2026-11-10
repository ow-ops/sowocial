import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function useStackOptions(): NativeStackNavigationOptions {
  const theme = useTheme();
  return {
    headerTintColor: theme.primary,
    headerTitleAlign: Platform.OS === 'android' ? 'left' : 'center',
    headerStyle: Platform.OS === 'ios' ? undefined : { backgroundColor: theme.page },
    headerTitleStyle: { fontFamily: Fonts.heading, color: theme.heading },
    headerLargeTitleStyle: { fontFamily: Fonts.display, color: theme.heading },
    headerBackTitleStyle: { fontFamily: Fonts.heading },
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: theme.page },
  };
}
