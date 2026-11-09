import { StyleSheet, View } from 'react-native';

import { Hairline, Overlay } from '@/constants/theme';
import type { Palette } from '@/theme/store';

const SHOWN = ['page', 'surface', 'primary', 'heading'] as const;

export function ThemeSwatches({ colors }: { colors: Partial<Palette> }) {
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants">
      {SHOWN.map((token) =>
        colors[token] ? <View key={token} style={[styles.dot, { backgroundColor: colors[token] }]} /> : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: -6,
    borderWidth: Hairline,
    borderColor: Overlay.swatchEdge,
  },
});
