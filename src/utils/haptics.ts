import * as Haptics from 'expo-haptics';

import { getPref } from '@/prefs/store';

export function tapHaptic() {
  if (process.env.EXPO_OS === 'ios' && getPref('haptics')) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function selectionHaptic() {
  if (process.env.EXPO_OS === 'ios' && getPref('haptics')) Haptics.selectionAsync().catch(() => {});
}
