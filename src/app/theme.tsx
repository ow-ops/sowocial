import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Section, SettingsScreen } from '@/components/settings';
import { ThemeSwatches } from '@/components/theme-swatches';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useScheme } from '@/hooks/use-theme';
import { decodeTheme } from '@/theme/share';
import { installThemeFile, themeColors } from '@/theme/store';
import { parseThemeFile, themeFileError } from '@/theme/theme-file';

// Opened from a shared link: sowocial://theme?css=<gzip+base64>.
export default function ThemeLink() {
  const { t } = useTranslation();
  const scheme = useScheme();
  const { css: encoded } = useLocalSearchParams<{ css?: string }>();
  const css = encoded ? decodeTheme(encoded) : null;
  const file = css ? parseThemeFile(css) : null;

  if (!css || !file || typeof file === 'string') {
    return (
      <SettingsScreen>
        <Stack.Screen options={{ title: t('settings.themeLink.title') }} />
        <ThemedText>{typeof file === 'string' ? themeFileError(file) : t('settings.themeLink.broken')}</ThemedText>
      </SettingsScreen>
    );
  }

  const name = file.meta.name ?? t('settings.themeLink.shared');
  const install = () => {
    installThemeFile(css, name);
    router.replace('/settings');
  };

  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: file.type === 'tweak' ? t('settings.themeLink.tweakTitle') : t('settings.themeLink.title') }} />
      <Section title={name}>
        <ThemeSwatches colors={file.type === 'theme' ? themeColors(css, file.meta.kind ?? scheme) : file.tokens} />
        <ThemedText type="meta">
          {[
            file.type === 'tweak'
              ? t('settings.themeLink.tweakTitle')
              : t('settings.themeLink.kindTheme', { kind: t(`settings.themeLink.${file.meta.kind ?? scheme}`) }),
            file.meta.author && t('settings.themeLink.by', { author: file.meta.author }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
        {file.meta.description && <ThemedText>{file.meta.description}</ThemedText>}
      </Section>
      <View style={styles.actions}>
        <Button label={t('settings.themeLink.install')} onPress={install} />
        <Button
          label={t('common.cancel')}
          variant="outline"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.two },
});
