import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gifMedia, useGifSearch, type Gif } from '@/api/gifs';
import { Button } from '@/components/button';
import { ThemedText, textStyles } from '@/components/themed-text';
import { frameless, Hairline, Radius, Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';

const SEARCH_DELAY_MS = 300;

export function GifPicker({ onClose, onPick }: { onClose: () => void; onPick: (gif: Gif) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), SEARCH_DELAY_MS);
  const search = useGifSearch(query);

  const status = !query
    ? undefined
    : search.isPending
      ? <ActivityIndicator color={theme.muted} style={styles.status} />
      : <ThemedText themeColor="muted" style={styles.status}>{search.isError ? t('compose.gif.failed') : t('compose.gif.none')}</ThemedText>;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* A page sheet sits below the status bar on iOS; Android's modal covers the whole screen. */}
      <View style={[styles.sheet, { backgroundColor: theme.page }, Platform.OS === 'android' && { paddingTop: insets.top + Spacing.three }]}>
        <View style={styles.header}>
          <ThemedText type="name" accessibilityRole="header">
            {t('compose.gif.title')}
          </ThemedText>
          <Button label={t('common.cancel')} size="small" variant="outline" onPress={onClose} />
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          // Klipy's terms ask for this wording.
          placeholder={t('compose.gif.search')}
          placeholderTextColor={theme.muted}
          selectionColor={theme.primary}
          accessibilityLabel={t('compose.gif.searchLabel')}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        />
        <FlatList
          data={query ? (search.data ?? []) : []}
          keyExtractor={(gif) => gif.id}
          numColumns={2}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + Spacing.three }]}
          ListEmptyComponent={status}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              accessibilityRole="button"
              accessibilityLabel={item.title || t('compose.gif.untitled')}
              style={[styles.cell, { backgroundColor: theme.surface }]}>
              <Image source={gifMedia(item.preview)} recyclingKey={item.id} contentFit="cover" style={StyleSheet.absoluteFill} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    ...frameless,
    ...textStyles.input,
    borderWidth: Hairline,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  grid: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  status: {
    paddingVertical: Spacing.five,
    textAlign: 'center',
  },
});
