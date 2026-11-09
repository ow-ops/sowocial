import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press, Shadow, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';

export function ComposeFab() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { gutter } = useColumn();

  return (
    <Pressable
      onPress={() => router.push('/compose')}
      accessibilityLabel={t('timeline.compose.newPost')}
      accessibilityRole="button"
      style={({ pressed, hovered }) => [
        styles.fab,
        {
          backgroundColor: theme.primary,
          bottom: insets.bottom + Spacing.three,
          right: insets.right + gutter + Spacing.three,
        },
        !reduceMotion && hovered && { transform: [{ scale: 1.05 }] },
        !reduceMotion && pressed && { transform: [{ scale: 0.95 }] },
        reduceMotion && pressed && { opacity: Press.opacity },
      ]}>
      <SymbolView
        name={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }}
        size={24}
        tintColor={theme.onPrimary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: Shadow.overlay,
  },
});
