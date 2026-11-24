import { useTranslation } from 'react-i18next';
import { Platform, Switch, View } from 'react-native';

import { Row, Section, SettingsScreen } from '@/components/settings';
import { useBothNetworks } from '@/components/source-badge';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PREF_OPTIONS, setPref, usePref } from '@/prefs/store';

type Toggle = 'alwaysShowSensitive' | 'alwaysExpandWarnings' | 'haptics' | 'altReminder' | 'columns' | 'mixedTimeline' | 'highlightDirect';

function ToggleRow({ pref, title, detail }: { pref: Toggle; title: string; detail?: string }) {
  const theme = useTheme();
  const value = usePref(pref);
  return (
    <Row
      title={title}
      detail={detail}
      role="switch"
      selected={value}
      onPress={() => setPref(pref, !value)}
      trailing={
        <Switch
          value={value}
          onValueChange={(next) => setPref(pref, next)}
          trackColor={{ true: theme.primary }}
          accessibilityLabel={title}
        />
      }
    />
  );
}

export default function ReadingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const autoplay = usePref('mediaAutoplay');
  const textSize = usePref('textSize');
  const density = usePref('density');
  const links = usePref('links');
  const bothNetworks = useBothNetworks();
  const autoplayOptions = PREF_OPTIONS.mediaAutoplay.filter((value) => value !== 'wifi' || Platform.OS !== 'web');

  return (
    <SettingsScreen title={t('settings.reading.title')}>
      <Section title={t('settings.reading.textSize')}>
        <SegmentedControl
          label={t('settings.reading.textSize')}
          options={PREF_OPTIONS.textSize.map((value) => ({ value, label: t(`settings.reading.sizes.${value}`) }))}
          value={textSize}
          onChange={(value) => setPref('textSize', value)}
        />
        <View style={[Outlined, { borderColor: theme.border, padding: Spacing.three }]}>
          <ThemedText>{t('settings.reading.preview')}</ThemedText>
        </View>
      </Section>

      <Section title={t('settings.reading.density')}>
        <SegmentedControl
          label={t('settings.reading.density')}
          options={PREF_OPTIONS.density.map((value) => ({ value, label: t(`settings.reading.densities.${value}`) }))}
          value={density}
          onChange={(value) => setPref('density', value)}
        />
        {Platform.OS === 'web' && <ToggleRow pref="columns" title={t('settings.reading.columns')} />}
        <ToggleRow
          pref="highlightDirect"
          title={t('settings.reading.highlightDirect')}
          detail={t('settings.reading.highlightDirectDetail')}
        />
      </Section>

      {bothNetworks && (
        <Section title={t('settings.reading.home')}>
          <ToggleRow
            pref="mixedTimeline"
            title={t('settings.reading.mixedTimeline')}
            detail={t('settings.reading.mixedTimelineDetail')}
          />
        </Section>
      )}

      <Section title={t('settings.reading.media')}>
        <ThemedText type="meta">{t('settings.reading.autoplay')}</ThemedText>
        <SegmentedControl
          label={t('settings.reading.autoplay')}
          options={autoplayOptions.map((value) => ({ value, label: t(`settings.reading.autoplayOptions.${value}`) }))}
          value={autoplay === 'wifi' && Platform.OS === 'web' ? 'always' : autoplay}
          onChange={(value) => setPref('mediaAutoplay', value)}
        />
        {Platform.OS !== 'ios' && (
          <ToggleRow pref="alwaysShowSensitive" title={t('settings.reading.alwaysShowSensitive')} />
        )}
        <ToggleRow pref="alwaysExpandWarnings" title={t('settings.reading.alwaysExpandWarnings')} />
      </Section>

      {Platform.OS !== 'web' && (
        <Section title={t('settings.reading.links')}>
          <SegmentedControl
            label={t('settings.reading.links')}
            options={PREF_OPTIONS.links.map((value) => ({ value, label: t(`settings.reading.linkOptions.${value}`) }))}
            value={links}
            onChange={(value) => setPref('links', value)}
          />
        </Section>
      )}

      <Section title={t('settings.reading.feedback')}>
        {Platform.OS === 'ios' && <ToggleRow pref="haptics" title={t('settings.reading.haptics')} />}
        <ToggleRow pref="altReminder" title={t('settings.reading.altReminder')} />
      </Section>
    </SettingsScreen>
  );
}
