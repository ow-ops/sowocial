import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { capabilitiesFor } from '@/api/backend/capabilities';
import { useSession } from '@/auth/session';
import { AccountSwitcher } from '@/components/account-switcher';
import { AboutServerRow } from '@/components/about-server-row';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { PushSettings } from '@/components/push-settings';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { ThemeSwatches } from '@/components/theme-swatches';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme, useThemeState } from '@/hooks/use-theme';
import { pickThemeFile } from '@/theme/share';
import { confirmAction } from '@/utils/dialog';
import { showError, showToast } from '@/utils/toast';
import {
  installThemeFile,
  removeTweak,
  themeColors,
  selectTheme,
  setAppearance,
  setTweakEnabled,
  type AppearanceSetting,
} from '@/theme/store';
import { parseThemeFile, themeFileError, type ThemeKind } from '@/theme/theme-file';

const APPEARANCES: AppearanceSetting[] = ['system', 'light', 'dark'];

export default function SettingsScreenRoute() {
  const { t } = useTranslation();
  const state = useThemeState();
  const theme = useTheme();
  const { session } = useSession();
  const capabilities = session && capabilitiesFor(session.protocol);

  const importFile = async () => {
    let picked;
    try {
      picked = await pickThemeFile();
    } catch (error) {
      return showError(t('settings.themes.pickFailed'), error instanceof Error ? error.message : undefined);
    }
    if (!picked) return;
    const error = picked === 'size' ? 'size' : installThemeFile(picked.css, picked.name);
    if (error) showError(t('settings.themes.importFailed'), themeFileError(error));
    else showToast(t('settings.themes.imported'));
  };

  return (
    <SettingsScreen title={t('common.nav.settings')}>
      {session && <AccountSwitcher />}
      {capabilities?.push && Platform.OS !== 'web' && <PushSettings />}

      <Section title={t('settings.appearance.title')}>
        <SegmentedControl
          label={t('settings.appearance.title')}
          options={APPEARANCES.map((value) => ({ value, label: t(`settings.appearance.${value}`) }))}
          value={state.appearance}
          onChange={setAppearance}
        />
      </Section>

      <Section title={t('settings.reading.title')}>
        <Row title={t('settings.reading.title')} chevron onPress={() => router.push('/settings/reading')} />
      </Section>

      {capabilities?.moderationLists && (
        <Section title={t('settings.privacy.title')}>
          <Row title={t('settings.privacy.muted')} chevron onPress={() => router.push('/settings/muted')} />
          <Row title={t('settings.privacy.blocked')} chevron onPress={() => router.push('/settings/blocked')} />
          <Row title={t('settings.privacy.blockedServers')} chevron onPress={() => router.push('/settings/blocked-domains')} />
        </Section>
      )}

      {capabilities?.filters && (
        <Section title={t('settings.content.title')}>
          <Row title={t('settings.content.filters')} chevron onPress={() => router.push('/settings/filters')} />
        </Section>
      )}

      {capabilities?.mutedWords && (
        <Section title={t('settings.content.title')}>
          <Row title={t('settings.mutedWords.title')} chevron onPress={() => router.push('/settings/muted-words')} />
        </Section>
      )}

      {capabilities?.services && (
        <Section title={t('settings.services.section')}>
          <Row title={t('settings.services.title')} chevron onPress={() => router.push('/settings/services')} />
        </Section>
      )}

      {capabilities?.serverInfo && (
        <Section title={t('settings.serverSection')}>
          <AboutServerRow />
        </Section>
      )}

      <ThemeSlot kind="light" />
      <ThemeSlot kind="dark" />

      {state.tweaks.length > 0 && (
        <Section title={t('settings.tweaks.title')}>
          <ThemedText type="meta">{t('settings.tweaks.hint')}</ThemedText>
          {state.tweaks.map((tweak) => (
            <Row
              key={tweak.id}
              title={tweak.name}
              trailing={
                <View style={styles.tweakActions}>
                  <Button
                    label={t('common.remove')}
                    accessibilityLabel={t('settings.tweaks.removeLabel', { name: tweak.name })}
                    size="small"
                    variant="outline"
                    onPress={() =>
                      confirmAction(t('settings.tweaks.removeConfirm', { name: tweak.name }), t('common.remove'), () =>
                        removeTweak(tweak.id),
                      )
                    }
                  />
                  <Switch
                    value={tweak.enabled}
                    onValueChange={(enabled) => setTweakEnabled(tweak.id, enabled)}
                    trackColor={{ true: theme.primary }}
                    accessibilityLabel={t('settings.tweaks.useLabel', { name: tweak.name })}
                  />
                </View>
              }
            />
          ))}
        </Section>
      )}

      <View style={styles.actions}>
        <Button label={t('settings.themes.browse')} onPress={() => router.push('/settings/catalog')} />
        <Button label={t('settings.themes.new')} variant="outline" onPress={() => router.push('/settings/theme/new')} />
        <Button label={t('settings.themes.import')} variant="outline" onPress={importFile} />
      </View>
    </SettingsScreen>
  );
}

function ThemeSlot({ kind }: { kind: ThemeKind }) {
  const { t } = useTranslation();
  const state = useThemeState();
  const themes = state.themes.filter((custom) => custom.kind === kind);
  const selected = state.selected[kind];

  return (
    <Section title={kind === 'light' ? t('settings.themes.lightTheme') : t('settings.themes.darkTheme')}>
      <Row
        title={t('settings.themes.default')}
        role="radio"
        selected={selected === null}
        leading={<ThemeSwatches colors={Colors[kind]} />}
        onPress={() => selectTheme(kind, null)}
      />
      {themes.map((custom) => {
        const file = parseThemeFile(custom.css);
        return (
          <Row
            key={custom.id}
            title={custom.name}
            detail={typeof file === 'string' ? undefined : (file.meta.author ?? undefined)}
            role="radio"
            selected={selected === custom.id}
            leading={<ThemeSwatches colors={themeColors(custom.css, kind)} />}
            trailing={
              <Button
                label={t('common.edit')}
                size="small"
                variant="outline"
                onPress={() => router.push({ pathname: '/settings/theme/[id]', params: { id: custom.id } })}
              />
            }
            onPress={() => selectTheme(kind, custom.id)}
          />
        );
      })}
      {themes.length === 0 && (
        <ThemedText type="meta">
          {kind === 'light' ? t('settings.themes.noneLight') : t('settings.themes.noneDark')}
        </ThemedText>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.two,
  },
  tweakActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
