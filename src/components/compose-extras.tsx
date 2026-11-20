import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { OPEN_AUDIENCES, type Audience, type InteractionAudiences } from '@/api/backend/draft';
import { deviceLanguage } from '@/api/compose-defaults';
import { Button } from '@/components/button';
import { useCompose, type ComposeState } from '@/components/compose-state';
import { DateTimeField } from '@/components/date-time-field';
import { EmojiPicker } from '@/components/emoji-picker';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Spacing } from '@/constants/theme';
import { intlLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';

export const LANGUAGES = [
  'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'nb', 'fi', 'pl', 'cs', 'ru', 'uk',
  'tr', 'el', 'he', 'ar', 'fa', 'hi', 'bn', 'id', 'vi', 'th', 'zh', 'ja', 'ko', 'eo', 'ca',
];

const AUDIENCES: Audience[] = ['everyone', 'followers', 'mentioned'];

const INTERACTIONS: (keyof InteractionAudiences)[] = ['reply', 'reblog', 'favourite'];

const DEFAULT_LEAD_MS = 60 * 60 * 1000;

const displayNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(intlLocale(), { type: 'language' }) : null;
export const languageName = (code: string) => displayNames?.of(code) ?? code;

type Settings = Pick<ComposeState, 'localOnly' | 'markdown' | 'language' | 'audiences' | 'scheduledAt'>;

function changedSettings(state: Settings, t: TFunction) {
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

export function ComposeExtras() {
  const { t } = useTranslation();
  const state = useCompose();
  const { emojiOpen, moreOpen } = state;
  const theme = useTheme();
  const router = useRouter();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languages = useMemo(
    () => (LANGUAGES.includes(state.language) ? LANGUAGES : [state.language, ...LANGUAGES]),
    [state.language],
  );

  const capabilities = useCapabilities();
  const expanded = moreOpen && !state.editing;
  const changed = !!state.editing || expanded ? [] : changedSettings(state, t);
  if (!emojiOpen && !expanded && changed.length === 0) return null;

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      {changed.length > 0 && <ThemedText type="meta">{changed.join(' · ')}</ThemedText>}

      {emojiOpen && <EmojiPicker onPick={state.insertEmoji} />}

      {expanded && (
        <>
          <View style={styles.row}>
            <Button label={t('compose.drafts.link')} variant="outline" size="small" onPress={() => router.push('/drafts')} />
            <Button
              label={t('compose.extras.language', { name: languageName(state.language) })}
              size="small"
              role="togglebutton"
              selected={languageOpen}
              onPress={() => setLanguageOpen((v) => !v)}
            />
            {capabilities.visibility && (
              <>
                <Button
                  label={t('compose.extras.localOnly')}
                  size="small"
                  role="switch"
                  selected={state.localOnly}
                  onPress={() => state.setLocalOnly(!state.localOnly)}
                />
                <Button
                  label={t('compose.extras.markdown')}
                  size="small"
                  role="switch"
                  selected={state.markdown}
                  onPress={() => state.setMarkdown(!state.markdown)}
                />
              </>
            )}
          </View>

          {languageOpen && (
            <ScrollView nestedScrollEnabled style={styles.languages}>
              <View style={styles.row} accessibilityRole="radiogroup">
                {languages.map((code) => (
                  <Button
                    key={code}
                    label={languageName(code)}
                    size="small"
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

          {capabilities.visibility && INTERACTIONS.map((key) => (
            <View key={key} style={styles.group}>
              <ThemedText type="meta" accessibilityRole="header">
                {t(`compose.extras.interactions.${key}`)}
              </ThemedText>
              <View style={styles.row} accessibilityRole="radiogroup">
                {AUDIENCES.map((a) => (
                  <Button
                    key={a}
                    label={t(`compose.extras.audiences.${a}`)}
                    size="small"
                    role="radio"
                    selected={state.audiences[key] === a}
                    onPress={() => state.setAudiences({ ...state.audiences, [key]: a })}
                  />
                ))}
              </View>
            </View>
          ))}

          {capabilities.scheduled && (
          <View style={styles.row}>
            <Button
              label={t('compose.extras.schedule')}
              size="small"
              role="togglebutton"
              selected={!!state.scheduledAt}
              onPress={() => state.setScheduledAt(state.scheduledAt ? null : new Date(Date.now() + DEFAULT_LEAD_MS))}
            />
            {state.scheduledAt && (
              <DateTimeField
                value={state.scheduledAt}
                onChange={state.setScheduledAt}
              />
            )}
            <Button label={t('compose.extras.scheduledPosts')} variant="outline" size="small" onPress={() => router.push('/scheduled')} />
          </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderTopWidth: Hairline,
  },
  group: {
    gap: Spacing.two,
  },
  languages: {
    maxHeight: 176,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
