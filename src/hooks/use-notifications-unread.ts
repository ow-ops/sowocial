import { useCapabilities } from '@/api/backend';
import { useBskyUnreadCount } from '@/api/bsky/notifications';
import { useNotificationsRead } from '@/api/ap/markers';

export function useNotificationsUnread() {
  const { unread: apUnread } = useNotificationsRead();
  const { data: bskyUnreadCount } = useBskyUnreadCount();
  const { unreadCount } = useCapabilities();
  return unreadCount ? !!bskyUnreadCount : apUnread;
}
