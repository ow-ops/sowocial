import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { PENDING_LIMIT } from '@/api/pending';
import { DismissiblePill } from '@/components/dismissible-pill';
import { ThemedText } from '@/components/themed-text';
import { Pill, Press, Shadow, Spacing } from '@/constants/theme';
import type { PillPosition } from '@/hooks/use-pill-position';
import { useTheme } from '@/hooks/use-theme';

export function NewPostsButton({
  count,
  more = false,
  position,
  hidden,
  onPress,
}: {
  count: number;
  more?: boolean;
  position: PillPosition;
  hidden: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  // A swiped-away pill stays away until more posts arrive.
  const [dismissedAt, setDismissedAt] = useState(0);
  if (count === 0 && dismissedAt > 0) setDismissedAt(0);
  if (count === 0 || count <= dismissedAt) return null;
  const amount = count >= PENDING_LIMIT ? `${PENDING_LIMIT}+` : more ? `${count}+` : count;
  const label = t('timeline.newPosts.label', { count, amount });
  return (
    <DismissiblePill position={position} hidden={hidden} onDismiss={() => setDismissedAt(count)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('timeline.newPosts.hint')}
        accessibilityLiveRegion="polite"
        hitSlop={Spacing.two}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.primary },
          pressed && { opacity: Press.opacity },
        ]}>
        <ThemedText type="label" style={{ color: theme.onPrimary }}>
          ↑ {label}
        </ThemedText>
      </Pressable>
    </DismissiblePill>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Pill,
    boxShadow: Shadow.raised,
  },
});
