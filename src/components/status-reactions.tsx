import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useReact, useReactionApi } from '@/api/ap/reactions';
import { ReactionChips } from '@/components/reaction-chips';
import { Press, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';
import { useOverlay } from '@/overlay/store';
import { tapHaptic } from '@/utils/haptics';

export function ReactionBar({ status }: { status: Post }) {
  const api = useReactionApi();
  const react = useReact();
  if (!api || !status.reactions?.length) return null;
  return (
    <ReactionChips
      reactions={status.reactions}
      onToggle={({ name, url, me }) => {
        tapHaptic();
        react.mutate({ status, name, url, on: !me });
      }}
      onShowReactors={() => useOverlay.getState().open({ kind: 'reactors', status, acting: status.accountKey })}
    />
  );
}

export function ReactAction({ status }: { status: Post }) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (!useReactionApi()) return null;
  return (
    <Pressable
      onPress={() => useOverlay.getState().open({ kind: 'react', status, acting: status.accountKey })}
      accessibilityRole="button"
      accessibilityLabel={t('status.reactions.react')}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && { opacity: Press.opacity }]}>
      <SymbolView name={{ ios: 'face.smiling', android: 'add_reaction', web: 'add_reaction' }} size={18} tintColor={theme.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: Spacing.one,
  },
});
