import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { useCustomEmojis } from '@/api/ap/emojis';
import { ThemedText, textStyles } from '@/components/themed-text';
import { frameless, Hairline, Press, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 32;
const CELL = 44;

export function EmojiPicker({ onPick }: { onPick: (shortcode: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: emojis, isPending, isError } = useCustomEmojis();
  const [query, setQuery] = useState('');
  const [width, setWidth] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  const needle = query.trim().toLowerCase();
  const shown = needle ? emojis?.filter((e) => e.shortcode.toLowerCase().includes(needle)) : emojis;
  const columns = Math.max(1, Math.floor(width / CELL));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.panel,
        { borderColor: theme.border, height: Math.min(Math.max(220, windowHeight * 0.3), 360, windowHeight * 0.45) },
      ]}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('compose.emoji.search')}
        placeholderTextColor={theme.muted}
        selectionColor={theme.primary}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t('compose.emoji.search')}
        style={[styles.search, { color: theme.heading, borderBottomColor: theme.border }]}
      />
      {isPending ? (
        <ActivityIndicator color={theme.muted} style={styles.status} />
      ) : isError ? (
        <ThemedText themeColor="danger" style={styles.status}>
          {t('compose.emoji.loadError')}
        </ThemedText>
      ) : shown?.length ? (
        width > 0 && <FlatList
          key={columns}
          data={shown}
          numColumns={columns}
          keyExtractor={(e) => e.shortcode}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          initialNumToRender={columns * 6}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.shortcode)}
              accessibilityRole="button"
              accessibilityLabel={item.shortcode}
              style={({ pressed }) => [styles.cell, pressed && { opacity: Press.opacity }]}>
              <Image source={item.url} style={styles.emoji} contentFit="contain" recyclingKey={item.shortcode} />
            </Pressable>
          )}
        />
      ) : (
        <ThemedText themeColor="muted" style={styles.status}>
          {t('compose.emoji.none')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: Hairline,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
  },
  search: {
    ...frameless,
    ...textStyles.input,
    minHeight: CELL,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: Hairline,
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    width: SIZE,
    height: SIZE,
  },
  status: {
    padding: Spacing.three,
  },
});
