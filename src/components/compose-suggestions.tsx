import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useSuggestions, type Suggestion } from '@/api/ap/compose';
import { useCustomEmojis } from '@/api/ap/emojis';
import { Avatar } from '@/components/avatar';
import { ThemedText, textStyles } from '@/components/themed-text';
import { Hairline, Outlined, Pill, Spacing, TouchTarget } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';
import type { Author } from '@/model/post';

const DEBOUNCE_MS = 250;
const EMOJI_LIMIT = 6;
const EMOJI_SIZE = 24;

export function SuggestionList({
  kind,
  query,
  onPick,
}: {
  kind: Suggestion['kind'];
  query: string;
  onPick: (suggestion: Suggestion) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data } = useSuggestions(kind, useDebounced(query, DEBOUNCE_MS));
  if (!query || !data?.length) return null;

  return (
    <View style={[styles.list, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      {data.map((s) => {
        const key = s.kind === 'account' ? s.account.id : s.name;
        const label = s.kind === 'account' ? `${s.account.displayName}, @${s.account.handle}` : `#${s.name}`;
        return (
          <Pressable
            key={key}
            onPress={() => onPick(s)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={s.kind === 'account' ? t('compose.suggestions.mentionHint') : t('compose.suggestions.hashtagHint')}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.border }]}>
            {s.kind === 'account' ? (
              <>
                <Avatar uri={s.account.avatar} size={32} />
                <View style={styles.names}>
                  <ThemedText type="label" numberOfLines={1}>
                    {s.account.displayName}
                  </ThemedText>
                  <ThemedText type="meta" numberOfLines={1}>
                    @{s.account.handle}
                  </ThemedText>
                </View>
              </>
            ) : (
              <ThemedText type="label">#{s.name}</ThemedText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmojiSuggestions({ query, onPick }: { query: string; onPick: (shortcode: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data } = useCustomEmojis();
  const q = query.toLowerCase();
  const matches = (data ?? [])
    .filter((e) => e.shortcode.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.shortcode.toLowerCase().startsWith(q)) - Number(!b.shortcode.toLowerCase().startsWith(q)))
    .slice(0, EMOJI_LIMIT);
  if (matches.length === 0) return null;

  return (
    <View style={[styles.list, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      {matches.map((e) => (
        <Pressable
          key={e.shortcode}
          onPress={() => onPick(e.shortcode)}
          accessibilityRole="button"
          accessibilityLabel={`:${e.shortcode}:`}
          accessibilityHint={t('compose.suggestions.emojiHint')}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.border }]}>
          <Image source={e.url} recyclingKey={e.url} cachePolicy="memory-disk" style={styles.emoji} />
          <ThemedText type="label" numberOfLines={1}>
            :{e.shortcode}:
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export function RecipientField({
  recipients,
  onChange,
}: {
  recipients: Author[];
  onChange: (recipients: Author[]) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const add = (s: Suggestion) => {
    if (s.kind !== 'account') return;
    if (!recipients.some((r) => r.id === s.account.id)) onChange([...recipients, s.account]);
    setQuery('');
  };

  return (
    <View style={styles.field}>
      <View style={styles.chips}>
        <ThemedText type="label" themeColor="muted">
          {t('compose.suggestions.to')}
        </ThemedText>
        {recipients.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => onChange(recipients.filter((x) => x.id !== r.id))}
            accessibilityRole="button"
            accessibilityLabel={`@${r.handle}`}
            accessibilityHint={t('compose.suggestions.removeRecipientHint')}
            hitSlop={6}
            style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText type="label" themeColor="primary">
              @{r.handle}
            </ThemedText>
          </Pressable>
        ))}
        <TextInput
          value={query}
          onChangeText={(q) => setQuery(q.replace(/^@/, '').trim())}
          placeholder={recipients.length ? t('compose.suggestions.addAnother') : t('compose.suggestions.searchPeople')}
          placeholderTextColor={theme.muted}
          selectionColor={theme.primary}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('compose.suggestions.addRecipient')}
          style={[styles.input, { color: theme.heading }]}
        />
      </View>
      <SuggestionList kind="account" query={query} onPick={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Pill,
    borderWidth: Hairline,
  },
  input: {
    flexGrow: 1,
    minWidth: 120,
    ...textStyles.input,
    paddingVertical: Spacing.two,
  },
  list: {
    ...Outlined,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  names: {
    flex: 1,
  },
  emoji: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
  },
});
