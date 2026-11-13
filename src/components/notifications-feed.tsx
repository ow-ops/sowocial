import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useBskyChatUnread } from '@/api/bsky/chat';
import { useBskyUnreadCount, useMarkBskyNotificationsSeen } from '@/api/bsky/notifications';
import { useCapabilities } from '@/api/backend';
import { keys, type NotificationFilter } from '@/api/keys';
import {
  isNewer,
  useLatestNotificationId,
  useSaveMarker,
  useNotificationsRead,
} from '@/api/ap/markers';
import type { NotificationItem } from '@/api/notification-groups';
import { useNotifications } from '@/api/timelines';
import { AnnouncementBanner } from '@/components/announcement-banner';
import { InfiniteList } from '@/components/infinite-list';
import { ExtraNotificationRow, isExtraNotification } from '@/components/notification-extra-rows';
import { GroupRow, NotificationRow, UnreadMarker } from '@/components/notification-rows';
import { SegmentedControl } from '@/components/segmented-control';
import { Hairline, Pill, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Notification } from '@/model/post';

const FILTERS: NotificationFilter[] = ['all', 'mentions', 'follows'];

type Query = ReturnType<typeof useNotifications>;

export function NotificationsFeed() {
  return useCapabilities().unreadCount ? <BskyNotifications /> : <ApNotifications />;
}

function ApNotifications() {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const { lastRead } = useNotificationsRead();
  const { data: latest } = useLatestNotificationId();
  const markRead = useSaveMarker('notifications');

  const seen = useRef({ lastRead, latest });
  useEffect(() => {
    seen.current = { lastRead, latest };
  }, [lastRead, latest]);
  const { mutate } = markRead;
  useFocusEffect(
    useCallback(
      () => () => {
        const { lastRead, latest } = seen.current;
        if (latest && latest !== lastRead) mutate(latest);
      },
      [mutate],
    ),
  );

  return (
    <NotificationList
      query={useNotifications(filter)}
      filter={filter}
      onFilter={setFilter}
      isUnread={(notification) => !!lastRead && isNewer(notification.id, lastRead)}
    />
  );
}

function BskyNotifications() {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const query = useNotifications(filter);
  const { data: unreadCount } = useBskyUnreadCount();
  const { mutate } = useMarkBskyNotificationsSeen();

  const seen = useRef({ unreadCount, newest: undefined as string | undefined });
  const newest = query.data?.pages[0]?.[0];
  useEffect(() => {
    seen.current = { unreadCount, newest: newest && notificationTime(newest) };
  }, [unreadCount, newest]);
  useFocusEffect(
    useCallback(
      () => () => {
        const { unreadCount, newest } = seen.current;
        if (unreadCount && newest) mutate(newest);
      },
      [mutate],
    ),
  );

  return (
    <NotificationList
      query={query}
      filter={filter}
      onFilter={setFilter}
      isUnread={(notification) => notification.protocol === 'bsky' && !notification.raw?.bsky.isRead}
    />
  );
}

function notificationTime(item: NotificationItem) {
  return (item.kind === 'group' ? item.notifications[0] : item.notification).createdAt;
}

function NotificationList({
  query,
  filter,
  onFilter,
  isUnread,
}: {
  query: Query;
  filter: NotificationFilter;
  onFilter: (filter: NotificationFilter) => void;
  isUnread: (notification: Notification) => boolean;
}) {
  const { t } = useTranslation();
  return (
    <InfiniteList
      query={query}
      queryKey={keys.notificationList(filter)}
      keyExtractor={(item) => item.key}
      getItemType={(item) =>
        item.kind === 'group'
          ? `group-${item.type}`
          : item.notification.type === 'mention' || item.notification.type === 'post' || item.notification.type === 'quote'
            ? 'status'
            : 'event'
      }
      renderItem={(item) => {
        const unread = isUnread(item.kind === 'group' ? item.notifications[0] : item.notification);
        return (
          <UnreadMarker unread={unread}>
            {item.kind === 'group' ? (
              <GroupRow group={item} unread={unread} />
            ) : isExtraNotification(item.notification) ? (
              <ExtraNotificationRow notification={item.notification} unread={unread} />
            ) : (
              <NotificationRow notification={item.notification} unread={unread} />
            )}
          </UnreadMarker>
        );
      }}
      header={
        <>
          <AnnouncementBanner />
          <FilterBar filter={filter} onChange={onFilter} />
        </>
      }
      emptyText={t('notifications.empty')}
      underTabs
    />
  );
}

function FilterBar({
  filter,
  onChange,
}: {
  filter: NotificationFilter;
  onChange: (filter: NotificationFilter) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { data: chatUnread = 0 } = useBskyChatUnread();
  return (
    <View style={[styles.filters, { backgroundColor: theme.page, borderBottomColor: theme.border }]}>
      <View style={styles.segments}>
        <SegmentedControl
          label={t('notifications.title')}
          options={FILTERS.map((value) => ({ value, label: t(`notifications.filters.${value}`) }))}
          value={filter}
          onChange={onChange}
        />
      </View>
      <Pressable
        onPress={() => router.push('/messages')}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={chatUnread > 0 ? t('notifications.messagesUnread') : t('notifications.messages')}>
        <SymbolView
          name={{ ios: 'envelope', android: 'mail', web: 'mail' }}
          size={22}
          tintColor={theme.primary}
        />
        {chatUnread > 0 && <View style={[styles.unreadDot, { backgroundColor: theme.danger, borderColor: theme.page }]} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: Hairline,
  },
  segments: {
    flex: 1,
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: Pill,
    borderWidth: 2,
  },
});
