import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { useAnnouncements } from '@/api/ap/announcements';
import { AnnouncementCard } from '@/components/announcement-card';
import { ErrorView } from '@/components/error-view';
import { SettingsScreen } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export default function AnnouncementsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data, error, refetch } = useAnnouncements();

  if (error) return <ErrorView error={error} retry={async () => void (await refetch())} />;
  return (
    <SettingsScreen title={t('announcements.title')}>
      {!data ? (
        <ActivityIndicator color={theme.primary} accessibilityLabel={t('announcements.loading')} />
      ) : data.length === 0 ? (
        <ThemedText themeColor="muted">{t('announcements.none')}</ThemedText>
      ) : (
        data.map((a) => <AnnouncementCard key={a.id} announcement={a} />)
      )}
    </SettingsScreen>
  );
}
