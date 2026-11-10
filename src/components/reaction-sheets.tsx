import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useCustomEmojis } from '@/api/ap/emojis';
import { useReact, useReactors } from '@/api/ap/reactions';
import { useCapabilities } from '@/api/backend';
import { Avatar } from '@/components/avatar';
import { EmojiPicker } from '@/components/emoji-picker';
import { ReactionGlyph } from '@/components/reaction-chips';
import { ThemedText } from '@/components/themed-text';
import { Press, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';
import { useOverlay } from '@/overlay/store';
import { tapHaptic } from '@/utils/haptics';

const COMMON = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🙏', '🔥', '👀', '🤔', '😍', '🥰', '😭', '🤣', '👏', '💯', '✨', '😊', '😅', '🫡', '🤝', '💜', '🫂'];
const CELL = 48;

export function ReactSheet({ status }: { status: Post }) {
  const { t } = useTranslation();
  const react = useReact();
  const close = useOverlay((s) => s.close);
  const { customEmojis } = useCapabilities();
  const { data: custom } = useCustomEmojis();
  const mine = new Set(status.reactions?.filter((r) => r.me).map((r) => r.name));

  const pick = (name: string, url?: string) => {
    tapHaptic();
    react.mutate({ status, name, url, on: !mine.has(name) });
    close();
  };

  return (
    <View style={styles.content}>
      <ThemedText type="name" accessibilityRole="header">
        {t('status.reactions.react')}
      </ThemedText>
      <View style={styles.grid}>
        {COMMON.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => pick(emoji)}
            accessibilityRole="button"
            accessibilityLabel={emoji}
            accessibilityState={{ selected: mine.has(emoji) }}
            style={({ pressed }) => [styles.cell, pressed && { opacity: Press.opacity }]}>
            <ThemedText style={styles.emoji}>{emoji}</ThemedText>
          </Pressable>
        ))}
      </View>
      {customEmojis && (
        <EmojiPicker onPick={(shortcode) => pick(shortcode, custom?.find((e) => e.shortcode === shortcode)?.url)} />
      )}
    </View>
  );
}

export function ReactorsSheet({ status }: { status: Post }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const close = useOverlay((s) => s.close);
  const { data, isPending, isError, error } = useReactors(status.id, true);

  return (
    <View style={styles.content}>
      <ThemedText type="name" accessibilityRole="header">
        {t('status.reactions.whoReacted')}
      </ThemedText>
      {isPending ? (
        <ActivityIndicator color={theme.muted} accessibilityLabel={t('status.reactions.loading')} />
      ) : isError ? (
        <ThemedText themeColor="danger">{error.message}</ThemedText>
      ) : data.length === 0 ? (
        <ThemedText themeColor="muted">{t('status.reactions.none')}</ThemedText>
      ) : (
        data.map((group) => (
          <View key={group.name} style={styles.group}>
            <View style={styles.groupHead}>
              <ReactionGlyph name={group.name} url={group.url} />
              <ThemedText type="meta">{group.accounts.length}</ThemedText>
            </View>
            {group.accounts.map((account) => (
              <Pressable
                key={account.id}
                onPress={() => {
                  close();
                  router.push({ pathname: '/account/[id]', params: { id: account.id } });
                }}
                accessibilityRole="button"
                accessibilityLabel={t('notifications.row.openAccount', { acct: account.handle })}
                style={({ pressed }) => [styles.person, pressed && { opacity: Press.opacity }]}>
                <Avatar uri={account.avatar} size={36} />
                <View style={styles.name}>
                  <ThemedText type="name" numberOfLines={1}>
                    {account.displayName}
                  </ThemedText>
                  <ThemedText type="meta" numberOfLines={1}>
                    @{account.handle}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 26,
    lineHeight: 32,
  },
  group: {
    gap: Spacing.one,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: CELL,
  },
  name: {
    flex: 1,
  },
});
