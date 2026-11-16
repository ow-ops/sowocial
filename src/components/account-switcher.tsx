import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { StyleSheet, View } from 'react-native';

import { useUnreadAccounts } from '@/api/account-unread';
import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Row, Section } from '@/components/settings';
import { NetworkGlyph, networkColor } from '@/components/source-badge';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t as translate } from '@/i18n';
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
              <View style={[styles.signOut, { borderLeftColor: theme.border }]}>
                <Button
                  label={t('profile.switcher.signOut')}
                  accessibilityLabel={t('profile.switcher.signOutOf', { name: label(s) })}
                  variant="outline"
                  onPress={() => confirmAction(t('profile.switcher.signOutConfirm', { name: label(s) }), t('profile.switcher.signOut'), () => removeAccount(s))}
                />
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
  signOut: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingLeft: Spacing.three,
    borderLeftWidth: Hairline,
  },
});