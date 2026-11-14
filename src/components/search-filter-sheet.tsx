import { BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SearchFilters } from '@/api/backend/types';
import { Button } from '@/components/button';
import { LANGUAGES, languageName } from '@/components/compose-extras';
import { OptionalDateField } from '@/components/optional-date-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Sheet } from '@/components/sheet';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { activeFilterCount, cleanFilters, isDateRangeValid } from '@/utils/search-filters';

type Props = {
  open: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  sortable: boolean;
};

// Native sheets size to their content and clip what does not fit, so the body gets its own height cap:
// the window less the keyboard, the status bar, the pinned buttons (measured) and the sheet's own chrome.
// SHEET_CHROME is the drag handle, the gap above the buttons and the sheet's bottom padding.
const SHEET_CHROME = 24 + Spacing.three + Spacing.five;
const MIN_BODY = 160;

export function SearchFilterSheet({ open, onClose, filters, onApply, sortable }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(filters);
  const [languageOpen, setLanguageOpen] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const insets = useSafeAreaInsets();
  const [actionsHeight, setActionsHeight] = useState(0);
  const bodyMax = windowHeight - keyboardHeight - insets.top - actionsHeight - SHEET_CHROME;
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(filters);
      setLanguageOpen(false);
    }
  }
  const rangeValid = isDateRangeValid(draft.since, draft.until);
  const languages = draft.lang && !LANGUAGES.includes(draft.lang) ? [draft.lang, ...LANGUAGES] : LANGUAGES;
  const language = draft.lang ? languageName(draft.lang) : t('timeline.search.anyLanguage');
  return (
    <Sheet open={open} onClose={onClose}>
      <BottomSheetScrollView
        style={{ maxHeight: Math.max(MIN_BODY, bodyMax) }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        nestedScrollEnabled>
        {sortable && (
          <>
            <ThemedText type="meta">{t('timeline.search.sort')}</ThemedText>
            <SegmentedControl
              label={t('timeline.search.sort')}
              options={[
                { value: 'top', label: t('timeline.search.sortTop') },
                { value: 'latest', label: t('timeline.search.sortLatest') },
              ]}
              value={draft.sort ?? 'top'}
              onChange={(sort) => setDraft({ ...draft, sort })}
            />
          </>
        )}
        <ThemedText type="meta">{t('timeline.search.from')}</ThemedText>
        <TextField
          value={draft.from ?? ''}
          onChangeText={(from) => setDraft({ ...draft, from: from || undefined })}
          placeholder={t('timeline.search.fromPlaceholder')}
          accessibilityLabel={t('timeline.search.from')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ThemedText type="meta">{t('timeline.search.since')}</ThemedText>
        <OptionalDateField
          label={t('timeline.search.since')}
          value={draft.since}
          max={draft.until}
          onChange={(since) => setDraft({ ...draft, since })}
        />
        <ThemedText type="meta">{t('timeline.search.until')}</ThemedText>
        <OptionalDateField
          label={t('timeline.search.until')}
          value={draft.until}
          min={draft.since}
          onChange={(until) => setDraft({ ...draft, until })}
        />
        {!rangeValid && (
          <ThemedText type="meta" themeColor="danger" accessibilityRole="alert">
            {t('timeline.search.dateRangeInvalid')}
          </ThemedText>
        )}
        <ThemedText type="meta">{t('timeline.search.language')}</ThemedText>
        <View style={styles.row}>
          <Button
            label={language}
            accessibilityLabel={t('timeline.search.languageValue', { value: language })}
            variant="outline"
            size="small"
            role="togglebutton"
            selected={languageOpen}
            onPress={() => setLanguageOpen((v) => !v)}
          />
        </View>
        {languageOpen && (
          <ScrollView nestedScrollEnabled style={styles.languages}>
            <View style={styles.options} accessibilityRole="radiogroup">
              <Button
                label={t('timeline.search.anyLanguage')}
                size="small"
                role="radio"
                selected={!draft.lang}
                onPress={() => {
                  setDraft({ ...draft, lang: undefined });
                  setLanguageOpen(false);
                }}
              />
              {languages.map((code) => (
                <Button
                  key={code}
                  label={languageName(code)}
                  size="small"
                  role="radio"
                  selected={draft.lang === code}
                  onPress={() => {
                    setDraft({ ...draft, lang: code });
                    setLanguageOpen(false);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </BottomSheetScrollView>
      <View style={styles.actions} onLayout={(event) => setActionsHeight(event.nativeEvent.layout.height)}>
        <Button label={t('timeline.search.apply')} disabled={!rangeValid} onPress={() => onApply(cleanFilters(draft))} />
        <View style={styles.secondary}>
          <Button
            label={t('timeline.search.clearFilters')}
            variant="outline"
            size="small"
            disabled={activeFilterCount(draft) === 0}
            onPress={() => onApply({})}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
  },
  actions: {
    gap: Spacing.three,
  },
  secondary: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  languages: {
    maxHeight: 176,
  },
});
