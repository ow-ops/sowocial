import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Hairline, Pill, Press, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Reaction } from '@/model/reaction';

const EMOJI_SIZE = 18;

export function ReactionGlyph({ name, url }: { name: string; url?: string }) {
  return url ? (
    <Image source={url} recyclingKey={url} cachePolicy="memory-disk" style={styles.image} accessibilityLabel={name} />
  ) : (
    <ThemedText style={styles.glyph}>{name}</ThemedText>
  );
}

type Props = {
  reactions: Reaction[];
  onToggle: (reaction: Reaction) => void;
  onShowReactors?: () => void;
};

export function ReactionChips({ reactions, onToggle, onShowReactors }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {reactions.map((reaction) => (
        <Pressable
          key={reaction.name}
          onPress={() => onToggle(reaction)}
          onLongPress={onShowReactors}
          accessibilityRole="button"
          accessibilityLabel={t(reaction.me ? 'status.reactions.chipOn' : 'status.reactions.chipOff', {
            name: reaction.name,
            count: reaction.count,
          })}
          accessibilityState={{ selected: reaction.me }}
          accessibilityActions={onShowReactors ? [{ name: 'reactors', label: t('status.reactions.whoReacted') }] : undefined}
          onAccessibilityAction={onShowReactors ? () => onShowReactors() : undefined}
          hitSlop={Spacing.one}
          style={({ pressed }) => [
            styles.chip,
            { borderColor: reaction.me ? theme.primary : theme.border, backgroundColor: reaction.me ? theme.surface : theme.page },
            pressed && { opacity: Press.opacity },
          ]}>
          <ReactionGlyph name={reaction.name} url={reaction.url} />
          <ThemedText type="meta" style={[styles.count, reaction.me && { color: theme.primary }]}>
            {reaction.count}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 32,
    paddingHorizontal: Spacing.two,
    borderWidth: Hairline,
    borderRadius: Pill,
  },
  glyph: {
    fontSize: EMOJI_SIZE - 2,
    lineHeight: EMOJI_SIZE + 4,
  },
  image: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
  },
  count: {
    fontVariant: ['tabular-nums'],
  },
});
