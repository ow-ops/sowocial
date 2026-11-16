import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { useCanModerate } from '@/api/ap/moderation';
import { capabilitiesFor } from '@/api/backend/capabilities';
import { buildBackup, planRestore } from '@/backup/backup';
import { pickBackupFile, shareBackupFile } from '@/backup/share';
import { applySnapshot, readSnapshot } from '@/backup/state';
import { useSession } from '@/auth/session';
import { AccountSwitcher } from '@/components/account-switcher';
import { AboutServerRow } from '@/components/about-server-row';
import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { PushSettings } from '@/components/push-settings';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { OwnThemeNote, ThemeSlot } from '@/components/theme-slot';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme, useThemeState } from '@/hooks/use-theme';
import { pickThemeFile } from '@/theme/share';
import { confirmAction } from '@/utils/dialog';
import { showError, showToast } from '@/utils/toast';
import {
  installThemeFile,
  removeTweak,
  setAppearance,
  setTweakEnabled,
  newThemeId,
  APPEARANCES,
} from '@/theme/store';
import { themeFileError } from '@/theme/theme-file';

export default function SettingsScreenRoute() {
  const { t } = useTranslation();
  const state = useThemeState();
  const theme = useTheme();
  const { session } = useSession();
  const capabilities = session && capabilitiesFor(session.protocol);
  const moderator = useCanModerate();

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

  const exportBackup = async () => {
    try {
      await shareBackupFile(buildBackup(readSnapshot()));
    } catch (error) {
      showError(t('settings.backup.exportFailed'), error instanceof Error ? error.message : undefined);
    }
  };

  const importBackup = async () => {
    let text: string | null;
    try {
      text = await pickBackupFile();
    } catch (error) {
      return showError(t('settings.backup.pickFailed'), error instanceof Error ? error.message : undefined);
    }
    if (text === null) return;
    const plan = planRestore(text, readSnapshot(), newThemeId);
    if ('error' in plan) return showError(t('settings.backup.importFailed'), t(`settings.backup.errors.${plan.error}`));
    confirmAction(
      t('settings.backup.importConfirm'),
      t('settings.backup.import'),
      () => {
        applySnapshot(plan.snapshot);
        showToast(t('settings.backup.imported'));
      },
      { destructive: false },
    );
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

      {capabilities?.listPurposes && (
        <Section title={t('settings.privacy.title')}>
          <Row title={t('settings.moderationLists.title')} chevron onPress={() => router.push('/settings/moderation-lists')} />
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

      {moderator && (
        <Section title={t('moderation.title')}>
          <Row title={t('moderation.title')} chevron onPress={() => router.push('/moderation')} />
        </Section>
      )}

      {session && <OwnThemeNote session={session} />}
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

      <Section title={t('settings.backup.title')}>
        <ThemedText type="meta">{t('settings.backup.hint')}</ThemedText>
        <View style={styles.actions}>
          <Button label={t('settings.backup.export')} variant="outline" onPress={exportBackup} />
          <Button label={t('settings.backup.import')} variant="outline" onPress={importBackup} />
        </View>
      </Section>

      <View style={styles.actions}>
        <Button label={t('settings.themes.browse')} onPress={() => router.push('/settings/catalog')} />
        <Button label={t('settings.themes.new')} variant="outline" onPress={() => router.push('/settings/theme/new')} />
        <Button label={t('settings.themes.import')} variant="outline" onPress={importFile} />
      </View>
    </SettingsScreen>
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
