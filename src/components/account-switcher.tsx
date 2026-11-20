import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { Pressable, StyleSheet, View } from 'react-native';

import { useUnreadAccounts } from '@/api/account-unread';
import { useSessionProfile } from '@/api/accounts';
import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { useReconnect } from '@/auth/use-reconnect';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import type { MenuGroup } from '@/components/menu-actions';
import { NativeMenu } from '@/components/native-menu';
import { Row, Section } from '@/components/settings';
import { NetworkGlyph, sessionHandle } from '@/components/source-badge';
import { Hairline, Pill, Press, Spacing, TouchTarget } from '@/constants/theme';
import { useAccountColor, useTheme } from '@/hooks/use-theme';
import { t as translate } from '@/i18n';
import { confirmAction } from '@/utils/dialog';
import { showError } from '@/utils/toast';

const label = (s: Session) => (s.acct ? `@${s.acct}` : translate('profile.switcher.fallbackName', { id: s.accountId }));
const host = (s: Session) => (s.protocol === 'bsky' ? s.pds : s.instance).replace(/^https?:\/\//, '');

const AVATAR = 40;
const BADGE = 20;
const DOT = 10;

function AccountAvatar({ session, active, unread }: { session: Session; active: boolean; unread: boolean }) {
  const theme = useTheme();
  const { data: profile } = useSessionProfile(session);
  return (
    <View style={[styles.avatar, { borderColor: active ? theme.primary : 'transparent' }]}>
      {profile?.avatar ? (
        <Avatar uri={profile.avatar} size={AVATAR} />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: theme.border }]} />
      )}
      <View style={[styles.badge, { backgroundColor: theme.surface }]}>
        <NetworkGlyph protocol={session.protocol} size={12} />
      </View>
      {unread && <View style={[styles.unread, { backgroundColor: theme.heading, borderColor: theme.surface }]} />}
    </View>
  );
}

function AccountColor({ account }: { account: string }) {
  const theme = useTheme();
  const color = useAccountColor(account);
  return color ? <View style={[styles.color, { backgroundColor: color, borderColor: theme.border }]} /> : null;
}

export function AccountSwitcher() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, sessions, switchAccount, removeAccount, needsReconnect } = useSession();
  const reconnect = useReconnect();
  const unread = useUnreadAccounts(sessions, session && accountKey(session));

  const switchTo = async (target: Session) => {
    await switchAccount(target);
    router.dismissTo('/home');
  };

  const reconnectTo = (target: Session) =>
    reconnect.mutate(target, { onError: (error) => showError(t('profile.switcher.reconnectFailed'), error.message) });

  const menu = (s: Session, active: boolean, expired: boolean): MenuGroup[] => [
    {
      key: 'account',
      items: [
        ...(expired
          ? [{ key: 'reconnect', title: t('auth.session.reconnectAction'), icon: 'arrow.clockwise', onPress: () => reconnectTo(s) }]
          : []),
        ...(active
          ? []
          : [{ key: 'switch', title: t('profile.switcher.switchTo'), icon: 'arrow.left.arrow.right', onPress: () => void switchTo(s) }]),
        {
          key: 'colors',
          title: t('profile.switcher.colors'),
          icon: 'paintpalette',
          onPress: () => router.push({ pathname: '/settings/account-theme', params: { account: accountKey(s) } }),
        },
      ],
    },
    {
      key: 'own',
      items: [
        {
          key: 'signOut',
          title: t('profile.switcher.signOut'),
          icon: 'rectangle.portrait.and.arrow.right',
          destructive: true,
          onPress: () => confirmAction(t('profile.switcher.signOutConfirm', { name: label(s) }), t('profile.switcher.signOut'), () => removeAccount(s)),
        },
      ],
    },
  ];

  return (
    <Section title={t('profile.switcher.title')}>
      {sessions.map((s) => {
        const key = accountKey(s);
        const active = key === (session && accountKey(session));
        const expired = active && needsReconnect;
        const reconnecting = expired && reconnect.isPending;
        const hasUnread = unread.has(key);
        const detail = reconnecting
          ? t('profile.switcher.reconnecting')
          : expired
            ? t('profile.switcher.reconnectNeeded')
            : `${host(s)} · ${t(`auth.network.${s.protocol}`)}`;
        const optionsLabel = t('profile.switcher.optionsFor', { name: sessionHandle(s) });
        const press = () => {
          if (expired) reconnectTo(s);
          else if (active) router.dismissTo('/me');
          else void switchTo(s);
        };
        return (
          <Row
            key={key}
            title={label(s)}
            detail={detail}
            detailTone={expired ? 'danger' : undefined}
            numberOfLines={1}
            accessibilityLabel={[label(s), detail, hasUnread && t('profile.switcher.unreadShort')].filter(Boolean).join(', ')}
            leading={<AccountAvatar session={s} active={active} unread={hasUnread} />}
            selected={active}
            onPress={reconnecting ? undefined : press}
            trailing={
              <View style={styles.trailing}>
                <AccountColor account={key} />
                <NativeMenu
                  label={optionsLabel}
                  trigger="icon"
                  groups={menu(s, active, expired)}
                  renderTrigger={(open, expanded) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={optionsLabel}
                      aria-haspopup="menu"
                      aria-expanded={expanded}
                      onPress={open}
                      style={({ pressed }) => [styles.more, pressed && { opacity: Press.opacity }]}>
                      <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }} size={20} tintColor={theme.muted} />
                    </Pressable>
                  )}
                />
              </View>
            }
          />
        );
      })}
      <View style={styles.add}>
        <Button label={t('profile.switcher.add')} variant="outline" onPress={() => router.push('/add-account')} />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  avatar: {
    padding: 2,
    borderWidth: 2,
    borderRadius: Pill,
  },
  placeholder: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: Pill,
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: BADGE,
    height: BADGE,
    borderRadius: Pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unread: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: DOT + 4,
    height: DOT + 4,
    borderRadius: Pill,
    borderWidth: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    // The ellipsis glyph is centred in a 48pt target; pull it back so it lines up with other rows' chevrons.
    marginRight: -Spacing.oneHalf,
  },
  color: {
    width: DOT,
    height: DOT,
    borderRadius: Pill,
    borderWidth: Hairline,
  },
  more: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    marginTop: Spacing.two,
  },
});
