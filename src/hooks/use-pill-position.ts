import { useAnimatedHeaderHeight } from 'expo-router/native-stack';
import { Animated, Platform } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';

export type PillPosition = { top: number; transform?: { translateY: Animated.AnimatedInterpolation<number> }[] };

export function usePillPosition(underTabs: boolean): PillPosition {
  const { tabBarInset } = useColumn();
  const headerHeight = useAnimatedHeaderHeight();
  const top = (underTabs ? tabBarInset : 0) + Spacing.two;
  // The iOS large title grows and shrinks with the scroll, so the pill follows the header's live height.
  return Platform.OS === 'ios' ? { top, transform: [{ translateY: headerHeight }] } : { top };
}
