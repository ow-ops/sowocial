import * as Haptics from 'expo-haptics';

export function tapHaptic() {
  if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function selectionHaptic() {
  if (process.env.EXPO_OS === 'ios') Haptics.selectionAsync().catch(() => {});
}
