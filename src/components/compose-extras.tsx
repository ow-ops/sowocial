import { BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCapabilities } from '@/api/backend';
import { OPEN_AUDIENCES, type Audience, type InteractionAudiences } from '@/api/backend/draft';
import { deviceLanguage } from '@/api/compose-defaults';
import { Button } from '@/components/button';
import { useCompose, type ComposeState } from '@/components/compose-state';
import { DateTimeField } from '@/components/date-time-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Row } from '@/components/settings';
import { Sheet } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { intlLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';

export const LANGUAGES = [
  'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'nb', 'fi', 'pl', 'cs', 'ru', 'uk',
  'tr', 'el', 'he', 'ar', 'fa', 'hi', 'bn', 'id', 'vi', 'th', 'zh', 'ja', 'ko', 'eo', 'ca',
];

const AUDIENCES: Audience[] = ['everyone', 'followers', 'mentioned'];

const INTERACTIONS: (keyof InteractionAudiences)[] = ['reply', 'reblog', 'favourite'];

const DEFAULT_LEAD_MS = 60 * 60 * 1000;

// Drag handle plus bottom padding.
const SHEET_CHROME = 24 + Spacing.five;

const displayNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(intlLocale(), { type: 'language' }) : null;
export const languageName = (code: string) => displayNames?.of(code) ?? code;

type Settings = Pick<ComposeState, 'localOnly' | 'markdown' | 'language' | 'audiences' | 'scheduledAt'>;

export function changedSettings(state: Settings, t: TFunction) {
  const parts: string[] = [];
  if (state.localOnly) parts.push(t('compose.extras.localOnly'));
  if (state.markdown) parts.push(t('compose.extras.markdown'));
  if (state.language !== deviceLanguage()) parts.push(languageName(state.language));
  for (const key of INTERACTIONS) {
    if (state.audiences[key] !== OPEN_AUDIENCES[key]) {
      parts.push(
        t('compose.extras.changedInteraction', {
          what: t(`compose.extras.interactionsShort.${key}`),
          audience: t(`compose.extras.audiences.${state.audiences[key]}`),
        }),
      );
    }
  }
  if (state.scheduledAt) {
    const date = state.scheduledAt.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
    parts.push(t('compose.extras.scheduledAt', { date }));
  }
  return parts;
}

export function ComposeMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const state = useCompose();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languages = useMemo(
    () => (LANGUAGES.includes(state.language) ? LANGUAGES : [state.language, ...LANGUAGES]),
    [state.language],
  );
  const capabilities = useCapabilities();

  const goTo = (path: '/drafts' | '/scheduled') => {
    onClose();
    router.push(path);
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <BottomSheetScrollView
        style={{ maxHeight: windowHeight - insets.top - SHEET_CHROME }}
        contentContainerStyle={styles.body}
        nestedScrollEnabled>
        <Row
          title={t('compose.extras.language', { name: languageName(state.language) })}
          chevron
          selected={languageOpen}
          onPress={() => setLanguageOpen((v) => !v)}
        />
        {languageOpen && (
          <ScrollView nestedScrollEnabled style={styles.languages}>
            <View style={styles.wrap} accessibilityRole="radiogroup">
              {languages.map((code) => (
                <Button
                  key={code}
                  label={languageName(code)}
                  size="small"
                  variant="outline"
                  role="radio"
                  selected={state.language === code}
                  onPress={() => {
                    state.setLanguage(code);
                    setLanguageOpen(false);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {capabilities.visibility && (
          <>
            <Row
              title={t('compose.extras.localOnly')}
              role="switch"
              selected={state.localOnly}
              onPress={() => state.setLocalOnly(!state.localOnly)}
              trailing={
                <Switch
                  value={state.localOnly}
                  onValueChange={state.setLocalOnly}
                  trackColor={{ true: theme.primary }}
                  accessibilityLabel={t('compose.extras.localOnly')}
                />
              }
            />
            <Row
              title={t('compose.extras.markdown')}
              role="switch"
              selected={state.markdown}
              onPress={() => state.setMarkdown(!state.markdown)}
              trailing={
                <Switch
                  value={state.markdown}
                  onValueChange={state.setMarkdown}
                  trackColor={{ true: theme.primary }}
                  accessibilityLabel={t('compose.extras.markdown')}
                />
              }
            />
            {INTERACTIONS.map((key) => (
              <View key={key} style={styles.group}>
                <ThemedText type="meta" accessibilityRole="header">
                  {t(`compose.extras.interactions.${key}`)}
                </ThemedText>
                <SegmentedControl
                  label={t(`compose.extras.interactions.${key}`)}
                  options={AUDIENCES.map((a) => ({ value: a, label: t(`compose.extras.audiences.${a}`) }))}
                  value={state.audiences[key]}
                  onChange={(a) => state.setAudiences({ ...state.audiences, [key]: a })}
                />
              </View>
            ))}
          </>
        )}

        {capabilities.scheduled && (
          <>
            <Row
              title={t('compose.extras.schedule')}
              role="switch"
              selected={!!state.scheduledAt}
              onPress={() => state.setScheduledAt(state.scheduledAt ? null : new Date(Date.now() + DEFAULT_LEAD_MS))}
              trailing={
                <Switch
                  value={!!state.scheduledAt}
                  onValueChange={(on) => state.setScheduledAt(on ? new Date(Date.now() + DEFAULT_LEAD_MS) : null)}
                  trackColor={{ true: theme.primary }}
                  accessibilityLabel={t('compose.extras.schedule')}
                />
              }
            />
            {state.scheduledAt && <DateTimeField value={state.scheduledAt} onChange={state.setScheduledAt} />}
            <Row title={t('compose.extras.scheduledPosts')} chevron onPress={() => goTo('/scheduled')} />
          </>
        )}

        <Row title={t('compose.drafts.link')} chevron onPress={() => goTo('/drafts')} />
      </BottomSheetScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  group: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  languages: {
    maxHeight: 176,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
