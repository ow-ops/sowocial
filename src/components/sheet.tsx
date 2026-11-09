import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { ColumnWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const theme = useTheme();
  return (
    <BottomSheet
      index={open ? 0 : -1}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: theme.page }}>
      <BottomSheetView style={styles.content}>{children}</BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: ColumnWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Platform.OS === 'web' ? 0 : Spacing.three,
    paddingBottom: Spacing.five,
  },
});
