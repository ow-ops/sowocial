import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInUp, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Hairline, Pill, Press, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { linkResolving } from '@/utils/link-resolving';

export function LinkResolvingPill() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const active = useSyncExternalStore(linkResolving.subscribe, linkResolving.isActive, linkResolving.isActive);
  if (!active) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(180)}
      exiting={reduceMotion ? undefined : FadeOut.duration(120)}
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + Spacing.two }]}>
      <Pressable
        onPress={linkResolving.cancel}
        accessibilityRole="button"
        accessibilityLabel={t('status.linkResolving.opening')}
        accessibilityHint={t('status.linkResolving.cancelHint')}
        accessibilityLiveRegion="polite"
        hitSlop={Spacing.two}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && { opacity: Press.opacity },
        ]}>
        <ActivityIndicator size="small" color={theme.primary} />
        <ThemedText type="label">{t('status.linkResolving.openingLabel')}</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Pill,
    borderWidth: Hairline,
    boxShadow: Shadow.raised,
  },
});
