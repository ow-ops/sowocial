import { StyleSheet, View } from 'react-native';

import { Hairline, Overlay } from '@/constants/theme';

// Android and web have no native color picker here; the hex field next to it edits the color.
export function ColorSwatch({ color }: { color: string; label: string; onChange: (color: string) => void }) {
  return <View style={[styles.swatch, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: Hairline,
    borderColor: Overlay.swatchEdge,
  },
});
