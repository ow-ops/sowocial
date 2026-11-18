import { useAnimatedHeaderHeight } from 'expo-router/native-stack';
import { useState } from 'react';
import { Animated, Platform, type LayoutChangeEvent } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';

export type PillPosition = {
  top: number;
  left: number;
  right: number;
  transform?: { translateY: Animated.AnimatedInterpolation<number> }[];
};

// below: how much of the list header is still on screen, so the pill sits under it instead of over it.
export function usePillPosition(underTabs: boolean, below = 0): PillPosition {
  const { tabBarInset, gutterLeft, gutterRight } = useColumn();
  const headerHeight = useAnimatedHeaderHeight();
  const top = (underTabs ? tabBarInset : 0) + below + Spacing.two;
  // Beside the web rail the column sits at the left of the feed, so the pill centres on the column, not the feed.
  const position = { top, left: gutterLeft, right: gutterRight };
  // The iOS large title grows and shrinks with the scroll, so the pill follows the header's live height.
  return Platform.OS === 'ios' ? { ...position, transform: [{ translateY: headerHeight }] } : position;
}

export function useListHeaderHeight() {
  const [height, setHeight] = useState(0);
  return { height, onLayout: (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height) };
}
