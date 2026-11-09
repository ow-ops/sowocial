import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext } from 'react';
import { Platform } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';

export function usePillTop(underTabs: boolean) {
  const { tabBarInset } = useColumn();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (Platform.OS === 'ios' ? headerHeight : 0) + (underTabs ? tabBarInset : 0) + Spacing.two;
}
