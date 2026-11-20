import { Pressable, StyleSheet } from 'react-native';
import { useTranslation as useI18n } from 'react-i18next';

import { hideTranslation, useCanTranslate, useShownTranslation, useTranslatePost } from '@/api/ap/translate';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { intlLocale } from '@/i18n';
import type { Post } from '@/model/post';

const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(intlLocale(), { type: 'language' }) : null;
const languageName = (code: string) => {
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
};

export function TranslateLine({ status }: { status: Post }) {
  const { t } = useI18n();
  const canTranslate = useCanTranslate(status);
  const translation = useShownTranslation(status.uid);
  const translate = useTranslatePost();
  if (!canTranslate) return null;

  const label = translation
    ? t('status.translate.from', {
        language: languageName(translation.detectedSourceLanguage ?? status.language ?? ''),
        provider: translation.provider,
      })
    : t('status.translate.action');
  const action = translation ? t('status.translate.showOriginal') : translate.isPending ? t('status.translate.loading') : undefined;

  return (
    <Pressable
      onPress={() => (translation ? hideTranslation(status.uid) : translate.mutate(status))}
      disabled={translate.isPending}
      accessibilityRole="button"
      accessibilityLabel={translation ? `${label}. ${t('status.translate.showOriginal')}` : t('status.translate.action')}
      accessibilityState={{ busy: translate.isPending }}
      hitSlop={Spacing.two}
      style={styles.line}>
      <ThemedText type="meta" themeColor={translation ? 'muted' : 'primary'}>
        {translation ? `${label} · ` : (action ?? label)}
        {translation && <ThemedText type="meta" themeColor="primary">{action}</ThemedText>}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
});
