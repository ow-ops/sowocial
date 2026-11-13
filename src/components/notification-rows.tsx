import { useRecyclingState } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { TFunction } from 'i18next';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useFollowRequest, useRelationship, useToggleFollow } from '@/api/accounts';
import type { NotificationGroup } from '@/api/notification-groups';
import { listId } from '@/api/bsky/lists';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { NetworkGlyph, useAccountSource, useBothNetworks } from '@/components/source-badge';
import { StatusCard } from '@/components/status-card';
import { EmojiText, StatusContent } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Pill, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { contentToText } from '@/model/content';
import type { Notification, NotificationType, Post } from '@/model/post';
import { shortRelativeTime } from '@/utils/relative-time';

type LabelKey = 'favourite' | 'reblog' | 'follow' | 'followRequest' | 'poll' | 'update' | 'liked' | 'reposted';

const BSKY_LABELS: Record<string, 'starterpackJoined' | 'verified' | 'unverified'> = {
  'starterpack-joined': 'starterpackJoined',
  verified: 'verified',
  unverified: 'unverified',
};

const bskyKey = (n: Notification): LabelKey | undefined =>
  n.protocol !== 'bsky' ? undefined : n.type === 'like' ? 'liked' : n.type === 'repost' ? 'reposted' : undefined;

function actionText(t: TFunction, n: Notification, label: { text: LabelKey } | undefined, count: number): string {
  if (n.protocol === 'bsky' && n.type === 'other') return t(`notifications.bsky.${BSKY_LABELS[n.nativeType] ?? 'other'}`);
  if (n.protocol === 'bsky' && n.nativeType === 'reply') return t('notifications.bsky.replied');
  return label ? t(`notifications.types.${bskyKey(n) ?? label.text}`, { count }) : n.nativeType;
}

const LABELS: Partial<
  Record<NotificationType, { text: LabelKey; icon: SymbolViewProps['name'] }>
> = {
  like: { text: 'favourite', icon: { ios: 'star.fill', android: 'star', web: 'star' } },
  repost: {
    text: 'reblog',
    icon: { ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' },
  },
  follow: {
    text: 'follow',
    icon: { ios: 'person.badge.plus', android: 'person_add', web: 'person_add' },
  },
  follow_request: {
    text: 'followRequest',
    icon: { ios: 'person.badge.clock', android: 'person_add', web: 'person_add' },
  },
  poll: { text: 'poll', icon: { ios: 'chart.bar', android: 'poll', web: 'poll' } },
  update: { text: 'update', icon: { ios: 'pencil', android: 'edit', web: 'edit' } },
};

const AVATAR_HIT_SLOP = 6;

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function UnreadMarker({ unread, children }: { unread: boolean; children: ReactElement }) {
  const theme = useTheme();
  return (
    <View>
      {children}
      {unread && <View style={[styles.unread, { backgroundColor: theme.primary }]} />}
    </View>
  );
}

function summarize(
  t: TFunction,
  { text, unread, status, createdAt }: { text: string; unread: boolean; status?: Post; createdAt: string },
) {
  return [
    unread ? t('notifications.row.unread', { text }) : text,
    status && (status.contentWarning ? t('a11y.contentWarning', { text: status.contentWarning }) : contentToText(status.content)),
    shortRelativeTime(createdAt),
  ]
    .filter(Boolean)
    .join('. ');
}

type ShellProps = {
  summary: string;
  hint: string;
  expanded?: boolean;
  onPress: () => void;
  icon: SymbolViewProps['name'];
  children: ReactNode;
};

export function RowShell({ summary, hint, expanded, onPress, icon, children }: ShellProps) {
  const theme = useTheme();
  const source = useAccountSource(useBothNetworks());
  return (
    <View style={[styles.row, { backgroundColor: theme.page, borderBottomColor: theme.border }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={source ? `${source.label}. ${summary}` : summary}
        accessibilityHint={hint}
        accessibilityState={expanded === undefined ? undefined : { expanded }}
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && { backgroundColor: theme.surface }]}
      />
      <View style={styles.icon} pointerEvents="none" {...HIDDEN}>
        <SymbolView name={icon} size={20} tintColor={theme.primary} />
        {source && <NetworkGlyph protocol={source.protocol} />}
      </View>
      <View style={styles.body} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

export function Excerpt({ status }: { status: Post }) {
  return (
    <View style={styles.excerpt} pointerEvents="none" {...HIDDEN}>
      <StatusContent content={status.content} muted />
    </View>
  );
}

export function NotificationRow({
  notification: n,
  unread,
}: {
  notification: Notification;
  unread: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  if ((n.type === 'mention' || n.type === 'post' || n.type === 'quote') && n.post) {
    return <StatusCard status={n.post} />;
  }

  const label = LABELS[n.type];
  const name = n.author.displayName;
  const action = actionText(t, n, label, 1);
  const starterPack = n.protocol === 'bsky' && n.nativeType === 'starterpack-joined' ? n.raw?.bsky.reasonSubject : undefined;
  const summary = summarize(t, {
    text: t('notifications.row.sentence', { who: name, action }),
    unread,
    status: n.post,
    createdAt: n.createdAt,
  });

  return (
    <RowShell
      summary={summary}
      hint={starterPack ? t('notifications.row.opensStarterPack') : n.post ? t('notifications.row.opensPost') : t('notifications.row.opensProfile')}
      onPress={() =>
        starterPack
          ? router.push({ pathname: '/starter-pack/[id]', params: { id: listId(starterPack) } })
          : n.post
            ? router.push(`/post/${n.post.id}`)
            : router.push(`/account/${n.author.id}`)
      }
      icon={label?.icon ?? { ios: 'bell', android: 'notifications', web: 'notifications' }}>
      <Pressable
        onPress={() => router.push(`/account/${n.author.id}`)}
        hitSlop={AVATAR_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('notifications.row.openAccount', { acct: n.author.handle })}>
        <Avatar uri={n.author.avatar} size={36} />
      </Pressable>
      <View pointerEvents="none" {...HIDDEN}>
        <EmojiText type="name" numberOfLines={1} text={name} emojis={n.author.emojis} />
        <ThemedText type="meta">{action}</ThemedText>
      </View>
      {n.type === 'follow_request' && <FollowRequestActions accountId={n.author.id} />}
      {n.type === 'follow' && n.protocol === 'bsky' && <FollowBack accountId={n.author.id} />}
      {n.post && <Excerpt status={n.post} />}
    </RowShell>
  );
}

const STACK_SIZE = 32;
const STACK_OVERLAP = 10;
const MAX_STACKED = 3;

function whoText(names: string[], t: TFunction) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return t('notifications.who.two', { first: names[0], second: names[1] });
  return t('notifications.who.more', { first: names[0], second: names[1], count: names.length - 2 });
}

export function GroupRow({ group, unread }: { group: NotificationGroup; unread: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [expanded, setExpanded] = useRecyclingState(false, [group.key]);
  const { notifications, type } = group;
  const label = LABELS[type]!;
  const status = notifications[0].post;
  const who = whoText(notifications.map((n) => n.author.displayName), t);
  const action = actionText(t, notifications[0], label, notifications.length);
  const isFollows = type === 'follow';
  const summary = summarize(t, {
    text: t('notifications.row.sentence', { who, action }),
    unread,
    status,
    createdAt: notifications[0].createdAt,
  });

  return (
    <RowShell
      summary={summary}
      hint={
        isFollows
          ? expanded
            ? t('notifications.row.hidesAccounts')
            : t('notifications.row.showsAccounts')
          : t('notifications.row.opensPost')
      }
      expanded={isFollows ? expanded : undefined}
      onPress={() => (isFollows ? setExpanded(!expanded) : router.push(`/post/${status!.id}`))}
      icon={label.icon}>
      <View style={styles.stack} pointerEvents="none" {...HIDDEN}>
        {notifications.slice(0, MAX_STACKED).map((n, i) => (
          <View
            key={n.id}
            style={[
              styles.stacked,
              { borderColor: theme.page, marginLeft: i === 0 ? 0 : -STACK_OVERLAP },
            ]}>
            <Avatar uri={n.author.avatar} size={STACK_SIZE} />
          </View>
        ))}
      </View>
      <View pointerEvents="none" {...HIDDEN}>
        <ThemedText type="name">{who}</ThemedText>
        <ThemedText type="meta">{action}</ThemedText>
      </View>
      {status && <Excerpt status={status} />}
      {isFollows && expanded && (
        <View>
          {notifications.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => router.push(`/account/${n.author.id}`)}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.row.openAccount', { acct: n.author.handle })}
              style={styles.member}>
              <Avatar uri={n.author.avatar} size={STACK_SIZE} />
              <View style={styles.memberName}>
                <EmojiText type="name" numberOfLines={1} text={n.author.displayName} emojis={n.author.emojis} />
                <ThemedText type="meta" numberOfLines={1}>
                  @{n.author.handle}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </RowShell>
  );
}

function FollowBack({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const { data: relationship } = useRelationship(accountId);
  const toggle = useToggleFollow(accountId);
  if (!relationship || relationship.following) return null;
  return (
    <View style={styles.requestActions}>
      <Button
        label={t('notifications.followBack')}
        size="small"
        loading={toggle.isPending}
        onPress={() => toggle.mutate(true)}
      />
    </View>
  );
}

function FollowRequestActions({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: relationship, isPending } = useRelationship(accountId);
  const respond = useFollowRequest(accountId);

  if (isPending) return <ActivityIndicator color={theme.muted} style={styles.requestStatus} />;

  // Servers that omit `requested_by` still get the buttons.
  if (relationship?.followedBy || relationship?.requestedBy === false) {
    return (
      <ThemedText type="meta">{relationship.followedBy ? t('notifications.followRequest.accepted') : t('notifications.followRequest.noLongerPending')}</ThemedText>
    );
  }

  return (
    <View style={styles.requestActions}>
      <Button
        label={t('notifications.followRequest.accept')}
        size="small"
        loading={respond.isPending && respond.variables}
        disabled={respond.isPending}
        onPress={() => respond.mutate(true)}
      />
      <Button
        label={t('notifications.followRequest.reject')}
        variant="outline"
        size="small"
        loading={respond.isPending && !respond.variables}
        disabled={respond.isPending}
        onPress={() => respond.mutate(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  unread: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.one,
    width: 8,
    height: 8,
    borderRadius: Pill,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: Hairline,
  },
  icon: {
    width: 44,
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  body: {
    flex: 1,
    gap: Spacing.two,
  },
  stack: {
    flexDirection: 'row',
  },
  stacked: {
    borderWidth: 2,
    borderRadius: Pill,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
  },
  memberName: {
    flex: 1,
  },
  excerpt: {
    maxHeight: 92,
    overflow: 'hidden',
  },
  requestActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  requestStatus: {
    alignSelf: 'flex-start',
  },
});
