import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const SIZE = 80;

export type BurstPoint = { id: number; x?: number; y?: number };

export function LikeBurst({ id, x, y }: BurstPoint) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!reduceMotion) {
      scale.value = withSequence(
        withTiming(1.15, { duration: 200, easing: Easing.out(Easing.exp) }),
        withTiming(1, { duration: 300 }),
      );
    }
    opacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(1, { duration: reduceMotion ? 220 : 140 }),
      withTiming(0, { duration: reduceMotion ? 200 : 280 }),
    );
  }, [id, reduceMotion, scale, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.burst,
        { left: x === undefined ? '50%' : x - SIZE / 2, top: y === undefined ? '50%' : y - SIZE / 2 },
        { marginLeft: x === undefined ? -SIZE / 2 : 0, marginTop: y === undefined ? -SIZE / 2 : 0 },
        style,
      ]}>
      <SymbolView
        name={{ ios: 'star.fill', android: 'star', web: 'star' }}
        size={SIZE}
        tintColor={theme.primary}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  burst: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
  },
});
