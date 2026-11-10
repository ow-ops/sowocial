import { useRouter } from 'expo-router';
import { type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { adminUrl } from '@/api/ap/server-detect';
import { useServerFeatures } from '@/api/ap/server';
import { useApSession } from '@/auth/session';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Excerpt, RowShell } from '@/components/notification-rows';
import { ReactionGlyph } from '@/components/reaction-chips';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Notification, NotificationType } from '@/model/post';
import { openLink } from '@/utils/open-link';
import { shortRelativeTime } from '@/utils/relative-time';

const EXTRA_TYPES: NotificationType[] = ['reaction', 'quoted_update', 'moderation_warning', 'severed', 'sign_up', 'report'];

export const isExtraNotification = ({ type, protocol }: Notification) =>
  EXTRA_TYPES.includes(type) || (type === 'other' && protocol === 'ap');

const ICONS: Record<string, SymbolViewProps['name']> = {
  reaction: { ios: 'face.smiling', android: 'add_reaction', web: 'add_reaction' },
  quoted_update: { ios: 'pencil', android: 'edit', web: 'edit' },
  moderation_warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  severed: { ios: 'person.2.slash', android: 'group_off', web: 'group_off' },
  sign_up: { ios: 'person.badge.plus', android: 'person_add', web: 'person_add' },
  report: { ios: 'flag', android: 'flag', web: 'flag' },
  other: { ios: 'bell', android: 'notifications', web: 'notifications' },
};

const WARNING_TEXT = {
  none: 'notifications.more.warning.none',
  disable: 'notifications.more.warning.disable',
  mark_statuses_as_sensitive: 'notifications.more.warning.mark_statuses_as_sensitive',
  delete_statuses: 'notifications.more.warning.delete_statuses',
  sensitive: 'notifications.more.warning.sensitive',
  silence: 'notifications.more.warning.silence',
  suspend: 'notifications.more.warning.suspend',
} as const;

const SEVERED_TEXT = {
  domain_block: 'notifications.more.severed.domain_block',
  user_domain_block: 'notifications.more.severed.user_domain_block',
  account_suspension: 'notifications.more.severed.account_suspension',
} as const;

export function ExtraNotificationRow({ notification: n, unread }: { notification: Notification; unread: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const instance = useApSession()?.instance;
  const software = useServerFeatures().data?.software ?? 'other';
  const { detail } = n;

  const admin = (kind: 'account' | 'report', id: string) => () => instance && openLink(adminUrl(instance, software, { kind, id }));
  const person = detail?.kind !== 'warning' && detail?.kind !== 'severed';

  let action = t('notifications.more.other', { type: n.nativeType });
  let open = () => router.push(`/account/${n.author.id}`);
  let hint = t('notifications.row.opensProfile');
  let body: string | undefined;
  let button: { label: string; hint: string; onPress: () => void } | undefined;

  switch (detail?.kind ?? n.type) {
    case 'reaction':
      action = t('notifications.more.reaction');
      break;
    case 'quoted_update':
      action = t('notifications.more.quotedUpdate');
      break;
    case 'sign_up':
      action = t('notifications.more.signUp');
      button = { label: t('notifications.more.review'), hint: t('notifications.more.opensAdmin'), onPress: admin('account', n.author.id) };
      break;
    case 'report':
      if (detail?.kind === 'report') {
        action = t('notifications.more.report', { target: detail.target.displayName });
        body = detail.comment || undefined;
        button = { label: t('notifications.more.openReport'), hint: t('notifications.more.opensAdmin'), onPress: admin('report', detail.id) };
      }
      break;
    case 'warning':
      if (detail?.kind === 'warning') {
        action = t(WARNING_TEXT[detail.action as keyof typeof WARNING_TEXT] ?? WARNING_TEXT.none);
        body = detail.text || undefined;
        if (instance && !detail.appealed) {
          button = {
            label: t('notifications.more.appeal'),
            hint: t('notifications.more.opensBrowser'),
            onPress: () => openLink(`${instance}/disputes/strikes/${detail.id}`),
          };
        }
      }
      break;
    case 'severed':
      if (detail?.kind === 'severed') {
        action = t(SEVERED_TEXT[detail.event as keyof typeof SEVERED_TEXT] ?? 'notifications.more.severed.default', { target: detail.target });
        body = detail.purged
          ? t('notifications.more.severedPurged')
          : t('notifications.more.severedCounts', { followers: detail.followers, following: detail.following });
      }
      break;
  }
  if (n.post) {
    const { post } = n;
    open = () => router.push(`/post/${post.id}`);
    hint = t('notifications.row.opensPost');
  } else if (!person) {
    hint = '';
  }

  const name = n.author.displayName;
  const sentence = person ? t('notifications.row.sentence', { who: name, action }) : action;
  const summary = [
    unread ? t('notifications.row.unread', { text: sentence }) : sentence,
    detail?.kind === 'reaction' ? detail.emoji : undefined,
    body,
    shortRelativeTime(n.createdAt),
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <RowShell summary={summary} hint={hint} onPress={person || n.post ? open : () => undefined} icon={ICONS[detail?.kind === 'warning' ? 'moderation_warning' : n.type] ?? ICONS.other}>
      {person && (
        <>
          <Avatar uri={n.author.avatar} size={36} />
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <EmojiText type="name" numberOfLines={1} text={name} emojis={n.author.emojis} />
            <View style={styles.action}>
              <ThemedText type="meta">{action}</ThemedText>
              {detail?.kind === 'reaction' && <ReactionGlyph name={detail.emoji} url={detail.url} />}
            </View>
          </View>
        </>
      )}
      {!person && <ThemedText type="name">{action}</ThemedText>}
      {body && <ThemedText themeColor="muted">{body}</ThemedText>}
      {n.post && <Excerpt status={n.post} />}
      {button && (
        <View style={styles.buttons}>
          <Button label={button.label} variant="outline" size="small" accessibilityHint={button.hint} onPress={button.onPress} />
        </View>
      )}
    </RowShell>
  );
}

const styles = StyleSheet.create({
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
