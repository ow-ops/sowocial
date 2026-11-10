import { useTranslation } from 'react-i18next';
import { Platform, Switch, View } from 'react-native';

import { Row, Section, SettingsScreen } from '@/components/settings';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setPref, usePref, type Prefs } from '@/prefs/store';

const AUTOPLAY: Prefs['mediaAutoplay'][] = ['always', 'wifi', 'never'];
const TEXT_SIZES: Prefs['textSize'][] = ['small', 'default', 'large', 'xlarge'];
const DENSITIES: Prefs['density'][] = ['comfortable', 'compact'];
const LINKS: Prefs['links'][] = ['inApp', 'system'];

type Toggle = 'alwaysShowSensitive' | 'alwaysExpandWarnings' | 'haptics' | 'altReminder';

function ToggleRow({ pref, title }: { pref: Toggle; title: string }) {
  const theme = useTheme();
  const value = usePref(pref);
  return (
    <Row
      title={title}
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
  const autoplayOptions = AUTOPLAY.filter((value) => value !== 'wifi' || Platform.OS !== 'web');

  return (
    <SettingsScreen title={t('settings.reading.title')}>
      <Section title={t('settings.reading.textSize')}>
        <SegmentedControl
          label={t('settings.reading.textSize')}
          options={TEXT_SIZES.map((value) => ({ value, label: t(`settings.reading.sizes.${value}`) }))}
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
          options={DENSITIES.map((value) => ({ value, label: t(`settings.reading.densities.${value}`) }))}
          value={density}
          onChange={(value) => setPref('density', value)}
        />
      </Section>

      <Section title={t('settings.reading.media')}>
        <ThemedText type="meta">{t('settings.reading.autoplay')}</ThemedText>
        <SegmentedControl
          label={t('settings.reading.autoplay')}
          options={autoplayOptions.map((value) => ({ value, label: t(`settings.reading.autoplayOptions.${value}`) }))}
          value={autoplay === 'wifi' && Platform.OS === 'web' ? 'always' : autoplay}
          onChange={(value) => setPref('mediaAutoplay', value)}
        />
        <ToggleRow pref="alwaysShowSensitive" title={t('settings.reading.alwaysShowSensitive')} />
        <ToggleRow pref="alwaysExpandWarnings" title={t('settings.reading.alwaysExpandWarnings')} />
      </Section>

      {Platform.OS !== 'web' && (
        <Section title={t('settings.reading.links')}>
          <SegmentedControl
            label={t('settings.reading.links')}
            options={LINKS.map((value) => ({ value, label: t(`settings.reading.linkOptions.${value}`) }))}
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
