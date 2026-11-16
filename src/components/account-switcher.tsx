import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Pressable, StyleSheet, View } from 'react-native';

import { useUnreadAccounts } from '@/api/account-unread';
import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Row, Section } from '@/components/settings';
import { NetworkGlyph, networkColor, sessionHandle } from '@/components/source-badge';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Press, Spacing, TouchTarget } from '@/constants/theme';
import { useScheme, useTheme, useThemeState } from '@/hooks/use-theme';
import { t as translate } from '@/i18n';
import { resolvePalette } from '@/theme/store';
import { confirmAction } from '@/utils/dialog';

const label = (s: Session) => (s.acct ? `@${s.acct}` : translate('profile.switcher.fallbackName', { id: s.accountId }));
const host = (s: Session) => (s.protocol === 'bsky' ? s.pds : s.instance).replace(/^https?:\/\//, '');

function ProtocolBadge({ protocol }: { protocol: Session['protocol'] }) {
  const { t } = useTranslation();
  return (
    <Badge>
      <NetworkGlyph protocol={protocol} />
      <ThemedText type="meta" themeColor={networkColor(protocol)}>
        {t(protocol === 'bsky' ? 'profile.switcher.bluesky' : 'profile.switcher.fediverse')}
      </ThemedText>
    </Badge>
  );
}

export function AccountSwitcher() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, sessions, switchAccount, removeAccount, needsReconnect } = useSession();
  const unread = useUnreadAccounts(sessions, session && accountKey(session));
  const themes = useThemeState();
  const scheme = useScheme();

  const switchTo = async (target: Session) => {
    await switchAccount(target);
    router.dismissTo('/home');
  };

  return (
    <Section title={t('profile.switcher.title')}>
      {sessions.map((s) => {
        const active = accountKey(s) === (session && accountKey(session));
        return (
          <Row
            key={accountKey(s)}
            title={label(s)}
            detail={
              active && needsReconnect
                ? t('profile.switcher.reconnectNeeded')
                : unread.has(accountKey(s))
                  ? t('profile.switcher.unread', { host: host(s) })
                  : host(s)
            }
            leading={<ProtocolBadge protocol={s.protocol} />}
            role="radio"
            selected={active}
            onPress={active ? undefined : () => switchTo(s)}
            trailing={
              <View style={styles.trailing}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.accountTheme.title', { handle: sessionHandle(s) })}
                  onPress={() => router.push({ pathname: '/settings/account-theme', params: { account: accountKey(s) } })}
                  style={({ pressed }) => [styles.themeButton, pressed && { opacity: Press.opacity }]}>
                  <View
                    style={[
                      styles.themeDot,
                      { backgroundColor: resolvePalette(themes, scheme, accountKey(s)).primary, borderColor: theme.border },
                    ]}
                  />
                </Pressable>
                <View style={[styles.signOut, { borderLeftColor: theme.border }]}>
                  <Button
                    label={t('profile.switcher.signOut')}
                    accessibilityLabel={t('profile.switcher.signOutOf', { name: label(s) })}
                    variant="outline"
                    onPress={() => confirmAction(t('profile.switcher.signOutConfirm', { name: label(s) }), t('profile.switcher.signOut'), () => removeAccount(s))}
                  />
                </View>
              </View>
            }
          />
        );
      })}
      <Button label={t('profile.switcher.add')} variant="outline" onPress={() => router.push('/add-account')} />
    </Section>
  );
}

const styles = StyleSheet.create({
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: Hairline,
  },
  signOut: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingLeft: Spacing.three,
    borderLeftWidth: Hairline,
  },
});
