import { View } from 'react-native';

import { useAnnouncements } from '@/api/ap/announcements';
import { AnnouncementCard } from '@/components/announcement-card';
import { Spacing } from '@/constants/theme';

export function AnnouncementBanner() {
  const unread = useAnnouncements().data?.find((a) => !a.read);
  if (!unread) return null;
  return (
    <View style={{ padding: Spacing.three }}>
      <AnnouncementCard announcement={unread} dismissible />
    </View>
  );
}
