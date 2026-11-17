import { useAnimatedHeaderHeight } from 'expo-router/native-stack';
import { useState } from 'react';
import { Animated, Platform, type LayoutChangeEvent } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';

export type PillPosition = { top: number; transform?: { translateY: Animated.AnimatedInterpolation<number> }[] };

// below: how much of the list header is still on screen, so the pill sits under it instead of over it.
export function usePillPosition(underTabs: boolean, below = 0): PillPosition {
  const { tabBarInset } = useColumn();
  const headerHeight = useAnimatedHeaderHeight();
  const top = (underTabs ? tabBarInset : 0) + below + Spacing.two;
  // The iOS large title grows and shrinks with the scroll, so the pill follows the header's live height.
  return Platform.OS === 'ios' ? { top, transform: [{ translateY: headerHeight }] } : { top };
}

export function useListHeaderHeight() {
  const [height, setHeight] = useState(0);
  return { height, onLayout: (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height) };
}
