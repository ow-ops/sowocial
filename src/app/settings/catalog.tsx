import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ErrorView } from '@/components/error-view';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { ThemeSwatches } from '@/components/theme-swatches';
import { Spacing } from '@/constants/theme';
import { useThemeCatalog } from '@/hooks/use-theme-catalog';
import { useScheme, useTheme, useThemeState } from '@/hooks/use-theme';
import type { CatalogEntry } from '@/theme/catalog';
import { installThemeFile, themeColors } from '@/theme/store';
import { themeFileError } from '@/theme/theme-file';
import { showError } from '@/utils/toast';

type Filter = 'all' | 'light' | 'dark' | 'tweak';
const FILTERS: Filter[] = ['all', 'light', 'dark', 'tweak'];
const FILTER_LABELS = {
  all: 'settings.catalog.all',
  light: 'settings.catalog.light',
  dark: 'settings.catalog.dark',
  tweak: 'settings.catalog.tweaks',
} as const;

export default function ThemeCatalog() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const catalog = useThemeCatalog();

  if (catalog.isError) return <ErrorView error={catalog.error} retry={async () => void (await catalog.refetch())} />;

  const entries = (catalog.data ?? []).filter(({ file }) =>
    filter === 'all' ? true : filter === 'tweak' ? file.type === 'tweak' : file.type === 'theme' && file.meta.kind === filter,
  );

  return (
    <SettingsScreen title={t('common.nav.themes')}>
      <View style={styles.filters} accessibilityRole="radiogroup">
        {FILTERS.map((value) => (
          <Button
            key={value}
            label={t(FILTER_LABELS[value])}
            size="small"
            role="radio"
            variant="outline"
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>
      {catalog.isPending ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <Section title={t('settings.catalog.files', { count: entries.length })}>
          {entries.map((entry) => (
            <CatalogRow key={entry.url} entry={entry} />
          ))}
        </Section>
      )}
    </SettingsScreen>
  );
}

function CatalogRow({ entry }: { entry: CatalogEntry }) {
  const { t } = useTranslation();
  const { themes, tweaks } = useThemeState();
  const scheme = useScheme();
  const { file } = entry;
  const installed = [...themes, ...tweaks].some((custom) => custom.source === entry.url);
  const kind = file.meta.kind ?? scheme;
  const detail = [file.type === 'tweak' ? t('settings.catalog.tweak') : null, file.meta.author, file.meta.description]
    .filter(Boolean)
    .join(' · ');

  const install = () => {
    const error = installThemeFile(entry.css, entry.basename, entry.url);
    if (error) showError(t('settings.catalog.installFailed'), themeFileError(error));
  };

  return (
    <Row
      title={file.meta.name ?? entry.basename}
      detail={detail || undefined}
      leading={<ThemeSwatches colors={file.type === 'theme' ? themeColors(entry.css, kind) : file.tokens} />}
      trailing={
        <Button
          label={installed ? t('settings.catalog.installed') : t('settings.catalog.install')}
          size="small"
          variant="outline"
          selected={installed}
          disabled={installed}
          onPress={install}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
