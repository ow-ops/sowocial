import { useEffect, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { PillPosition } from '@/hooks/use-pill-position';

const DRAG_START = 8;
const DISMISS_DISTANCE = 64;
const DISMISS_VELOCITY = 0.5;
const HIDDEN_OFFSET = -96;
const DURATION = 180;

export function DismissiblePill({
  position,
  hidden,
  onDismiss,
  children,
}: {
  position: PillPosition;
  hidden: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [drag] = useState(() => new Animated.ValueXY());
  const [shown] = useState(() => new Animated.Value(hidden ? 0 : 1));
  const [thrown, setThrown] = useState(false);
  useEffect(() => {
    if (thrown) onDismiss();
  }, [thrown, onDismiss]);

  useEffect(() => {
    Animated.timing(shown, { toValue: hidden ? 0 : 1, duration: reduceMotion ? 0 : DURATION, useNativeDriver: true }).start();
  }, [hidden, shown, reduceMotion]);

  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > DRAG_START || g.dy < -DRAG_START,
      onPanResponderMove: (_, g) => drag.setValue({ x: g.dx, y: Math.min(0, g.dy) }),
      onPanResponderRelease: (_, g) => {
        const sideways = Math.abs(g.dx) > DISMISS_DISTANCE || Math.abs(g.vx) > DISMISS_VELOCITY;
        const up = g.dy < -DISMISS_DISTANCE / 2 || g.vy < -DISMISS_VELOCITY;
        if (!sideways && !up) {
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
          return;
        }
        const to = sideways ? { x: Math.sign(g.dx) * 400, y: 0 } : { x: 0, y: HIDDEN_OFFSET };
        Animated.timing(drag, { toValue: to, duration: DURATION, useNativeDriver: true }).start(() => setThrown(true));
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(),
    }),
  );

  if (thrown) return null;
  return (
    <Animated.View style={[styles.position, position]} pointerEvents={hidden ? 'none' : 'box-none'}>
      <Animated.View
        {...responder.panHandlers}
        style={{
          opacity: shown,
          transform: [
            { translateX: drag.x },
            { translateY: Animated.add(drag.y, shown.interpolate({ inputRange: [0, 1], outputRange: [HIDDEN_OFFSET, 0] })) },
          ],
        }}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    alignSelf: 'center',
  },
});
