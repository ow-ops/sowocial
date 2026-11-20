import type { InfiniteData } from '@tanstack/react-query';
import type { Page } from '@/model/page';
import type { Notification } from '@/model/post';

type GroupedType = 'like' | 'repost' | 'follow';

export type NotificationGroup = {
  kind: 'group';
  key: string;
  type: GroupedType;
  notifications: Notification[];
};

export type NotificationItem = { kind: 'single'; key: string; notification: Notification } | NotificationGroup;

const FOLLOW_WINDOW_MS = 6 * 60 * 60 * 1000;

// GoToSocial has no grouped notifications endpoint, so they are grouped here.
export function groupNotifications(notifications: Notification[]): NotificationItem[] {
  const items: NotificationItem[] = [];
  const open = new Map<string, NotificationGroup>();

  for (const notification of notifications) {
    const { type, post } = notification;
    const groupable = (type === 'like' || type === 'repost') && post ? type : type === 'follow' ? type : undefined;
    if (!groupable) {
      items.push({ kind: 'single', key: notification.id, notification });
      continue;
    }

    const bucket = groupable === 'follow' ? 'follow' : `${groupable}:${post!.id}`;
    const group = open.get(bucket);
    const previous = group?.notifications.at(-1);
    const near =
      groupable !== 'follow' ||
      (!!previous && Date.parse(previous.createdAt) - Date.parse(notification.createdAt) <= FOLLOW_WINDOW_MS);
    if (group && near) {
      group.notifications.push(notification);
      continue;
    }
    const created: NotificationGroup = {
      kind: 'group',
      key: groupable === 'follow' ? `follow:${notification.id}` : bucket,
      type: groupable,
      notifications: [notification],
    };
    open.set(bucket, created);
    items.push(created);
  }

  return items.map((item) =>
    item.kind === 'group' && item.notifications.length === 1
      ? { kind: 'single', key: item.notifications[0].id, notification: item.notifications[0] }
      : item,
  );
}

export const selectGrouped = (data: InfiniteData<Page<Notification>>): InfiniteData<NotificationItem[]> => ({
  pages: [groupNotifications(data.pages.flatMap((page) => page.items))],
  pageParams: data.pageParams,
});
