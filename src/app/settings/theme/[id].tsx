import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ColorSwatch } from '@/components/color-swatch';
import { Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText, textStyles } from '@/components/themed-text';
import { t as translate } from '@/i18n';
import { BorderWidth, Colors, Fonts, Hairline, Outlined, Pill, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useScheme, useTheme, useThemeState } from '@/hooks/use-theme';
import { CONTRAST_PAIRS, contrastRatio } from '@/theme/contrast';
import { shareThemeFile, themeLink } from '@/theme/share';
import { newThemeId, removeTheme, saveTheme, selectTheme, themeColors, type Palette } from '@/theme/store';
import { isColor, parseThemeFile, serializeThemeFile, TOKENS, type ThemeKind } from '@/theme/theme-file';
import { confirmAction } from '@/utils/dialog';

const tokenLabel = (token: ThemeColor) => translate(`settings.themeEditor.tokens.${token}`);

export default function ThemeEditor() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useThemeState().themes.find((custom) => custom.id === id);
  const scheme = useScheme();
  const meta = existing ? parseThemeFile(existing.css) : null;

  const [name, setName] = useState(existing?.name ?? t('settings.themeEditor.defaultName'));
  const [author, setAuthor] = useState(meta && typeof meta !== 'string' ? (meta.meta.author ?? '') : '');
  const [kind, setKind] = useState<ThemeKind>(existing?.kind ?? scheme);
  const [colors, setColors] = useState<Palette>(() =>
    existing ? themeColors(existing.css, existing.kind) : { ...Colors[scheme] },
  );

  const invalid = TOKENS.filter((token) => !isColor(colors[token]));
  const css = serializeThemeFile({
    type: 'theme',
    meta: { name: name.trim() || t('settings.themeEditor.defaultName'), author: author.trim() || null, description: null, kind, contrast: 'low', tags: [] },
    tokens: colors,
  });

  // Saving makes the theme local, so a catalog refresh will not overwrite the edits.
  const save = () => {
    const theme = { id: existing?.id ?? newThemeId(), name: name.trim() || t('settings.themeEditor.defaultName'), kind, css };
    saveTheme(theme);
    selectTheme(kind, theme.id);
    router.back();
  };

  const remove = () =>
    confirmAction(t('settings.themeEditor.deleteConfirm', { name: existing?.name }), t('common.delete'), () => {
      removeTheme(existing!.id);
      router.back();
    });

  return (
    <>
      <Stack.Screen options={{ title: existing ? t('settings.themeEditor.editTitle') : t('settings.themeEditor.newTitle') }} />
      <SettingsScreen>
        <Preview colors={colors} />

        <Section title={t('settings.themeEditor.about')}>
          <Field label={t('settings.themeEditor.name')} value={name} onChange={setName} />
          <Field label={t('settings.themeEditor.author')} value={author} onChange={setAuthor} placeholder={t('settings.themeEditor.optional')} />
          <View style={styles.choices} accessibilityRole="radiogroup">
            {(['light', 'dark'] as const).map((k) => (
              <Button
                key={k}
                label={k === 'light' ? t('settings.themes.lightTheme') : t('settings.themes.darkTheme')}
                size="small"
                role="radio"
                variant="outline"
                selected={kind === k}
                onPress={() => setKind(k)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('settings.themeEditor.colors')}>
          {TOKENS.map((token) => (
            <ColorRow
              key={token}
              label={tokenLabel(token)}
              value={colors[token]}
              onChange={(value) => setColors((c) => ({ ...c, [token]: value }))}
            />
          ))}
        </Section>

        <ContrastWarnings colors={colors} />

        <View style={styles.actions}>
          <Button label={t('settings.themeEditor.saveAndUse')} onPress={save} disabled={invalid.length > 0} />
          {invalid.length > 0 && (
            <ThemedText themeColor="danger">
              {t('settings.themeEditor.invalidColors', { colors: invalid.map(tokenLabel).join(', ') })}
            </ThemedText>
          )}
          <Button
            label={t('settings.themeEditor.shareLink')}
            variant="outline"
            disabled={invalid.length > 0}
            onPress={() => Share.share({ message: themeLink(css) })}
          />
          {Platform.OS !== 'web' && (
            <Button
              label={t('settings.themeEditor.export')}
              variant="outline"
              disabled={invalid.length > 0}
              onPress={() => shareThemeFile(name, css)}
            />
          )}
          {existing && <Button label={t('settings.themeEditor.delete')} variant="outline" onPress={remove} />}
        </View>
      </SettingsScreen>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="meta">{label}</ThemedText>
      <TextField
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel={label}
        style={styles.compact}
      />
    </View>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const valid = isColor(value);
  return (
    <View style={styles.colorRow}>
      <ColorSwatch color={valid ? value : 'transparent'} label={label} onChange={onChange} />
      <ThemedText style={styles.colorLabel} numberOfLines={2}>
        {label}
      </ThemedText>
      <TextField
        value={value}
        onChangeText={(text) => onChange(text.trim())}
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={theme.primary}
        accessibilityLabel={t('settings.themeEditor.colorLabel', { label })}
        accessibilityHint={t('settings.themeEditor.colorHint')}
        style={[
          styles.compact,
          styles.hex,
          { color: theme.heading, borderColor: valid ? theme.outline : theme.danger },
        ]}
      />
    </View>
  );
}

// Drawn with the colors being edited, not the app's current theme.
function Preview({ colors }: { colors: Palette }) {
  const { t } = useTranslation();
  return (
    <View
      style={[styles.preview, { backgroundColor: colors.canvas, borderColor: colors.border }]}
      accessibilityLabel={t('settings.themeEditor.preview')}>
      <View style={[styles.previewPage, { backgroundColor: colors.page }]}>
        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText type="name" style={{ color: colors.heading }}>
            Alice <ThemedText type="meta" style={{ color: colors.muted }}>@alice · 2m</ThemedText>
          </ThemedText>
          <ThemedText style={{ color: colors.text }}>
            {t('settings.themeEditor.previewBody')} <ThemedText style={{ color: colors.primary }}>#sowocial</ThemedText>
          </ThemedText>
          <ThemedText type="meta" style={{ color: colors.danger }}>
            {t('settings.themeEditor.previewDelete')}
          </ThemedText>
        </View>
        <View style={styles.previewButtons}>
          <View style={[styles.previewButton, { backgroundColor: colors.primary }]}>
            <ThemedText type="label" style={{ color: colors.onPrimary }}>
              {t('settings.themeEditor.previewPost')}
            </ThemedText>
          </View>
          <View style={[styles.previewButton, { borderColor: colors.outline, borderWidth: BorderWidth.input }]}>
            <ThemedText type="label" style={{ color: colors.heading }}>
              {t('common.cancel')}
            </ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

function ContrastWarnings({ colors }: { colors: Palette }) {
  const { t } = useTranslation();
  const low = CONTRAST_PAIRS.flatMap(([fg, bg, min]) => {
    const ratio = contrastRatio(colors[fg], colors[bg]);
    return ratio !== null && ratio < min
      ? [
          t('settings.themeEditor.contrastPair', {
            foreground: tokenLabel(fg),
            background: tokenLabel(bg).toLowerCase(),
            ratio: ratio.toFixed(1),
            min,
          }),
        ]
      : [];
  });
  if (low.length === 0) return null;
  return (
    <Section title={t('settings.themeEditor.lowContrast')}>
      <ThemedText type="meta">{t('settings.themeEditor.lowContrastHint')}</ThemedText>
      {low.map((line) => (
        <ThemedText key={line} themeColor="danger">
          {line}
        </ThemedText>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  choices: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  compact: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  colorLabel: {
    flex: 1,
  },
  hex: {
    width: 120,
    ...textStyles.meta,
    fontFamily: Fonts.mono,
  },
  preview: {
    borderWidth: Hairline,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  previewPage: {
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  previewCard: {
    ...Outlined,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  previewButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  previewButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: Pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
