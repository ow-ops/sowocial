import * as Menu from '@radix-ui/react-menu';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSessionProfile } from '@/api/accounts';
import { accountKey } from '@/auth/account-key';
import { useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { Avatar } from '@/components/avatar';
import { NetworkGlyph } from '@/components/source-badge';
import { ThemedText } from '@/components/themed-text';
import { BorderWidth, Fonts, Radius, Shadow, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const handleOf = (s: Session) => `@${s.acct ?? s.accountId}`;

function Identity({ session, size }: { session: Session; size: number }) {
  const theme = useTheme();
  const { data: profile } = useSessionProfile(session);
  return (
    <>
      {profile?.avatar ? (
        <Avatar uri={profile.avatar} size={size} />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.border }]} />
      )}
      <View style={styles.text}>
        <ThemedText type="label" numberOfLines={1} style={{ color: theme.heading }}>
          {profile?.displayName || handleOf(session)}
        </ThemedText>
        <View style={styles.handleRow}>
          <NetworkGlyph protocol={session.protocol} size={12} />
          <ThemedText type="meta" numberOfLines={1} style={styles.handle}>
            {handleOf(session)}
          </ThemedText>
        </View>
      </View>
    </>
  );
}

const menuCss = `
  [data-sowocial-account-item][data-highlighted] { background: var(--menu-highlight); }
  [data-sowocial-account-item]:focus-visible { outline: 2px solid var(--menu-ring); outline-offset: -2px; }
`;

export function RailAccount() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, sessions, switchAccount, needsReconnect } = useSession();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  if (!session) return null;
  const activeKey = accountKey(session);

  const content: CSSProperties & Record<`--${string}`, string> = {
    '--menu-highlight': theme.border,
    '--menu-ring': theme.primary,
    width: 280,
    padding: Spacing.one,
    borderRadius: Radius.md,
    border: `${BorderWidth.input}px solid ${theme.border}`,
    background: theme.surface,
    boxShadow: Shadow.overlay,
    zIndex: 1000,
  };
  const item: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: Spacing.oneHalf,
    minHeight: TouchTarget + Spacing.one,
    padding: `${Spacing.one}px ${Spacing.two}px`,
    borderRadius: Radius.sm,
    cursor: 'pointer',
    outline: 'none',
    userSelect: 'none',
  };
  const action: CSSProperties = { ...item, minHeight: TouchTarget - Spacing.one, fontFamily: Fonts.heading, fontSize: 16, color: theme.heading };

  const choose = async (target: Session) => {
    if (accountKey(target) === activeKey) return;
    await switchAccount(target);
    router.replace('/home');
  };

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Anchor ref={anchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.switcher.current', { name: handleOf(session) })}
          aria-haspopup="menu"
          aria-expanded={open}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onPress={() => setOpen(true)}
          style={[styles.chip, (hovered || open) && { backgroundColor: theme.surface }]}>
          <Identity session={session} size={36} />
          {needsReconnect && <View style={[styles.alert, { backgroundColor: theme.danger }]} />}
          <SymbolView
            name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more', web: 'unfold_more' }}
            size={16}
            tintColor={theme.muted}
          />
        </Pressable>
      </Menu.Anchor>
      <Menu.Portal>
        <Menu.Content
          aria-label={t('profile.switcher.title')}
          side="top"
          align="start"
          sideOffset={Spacing.one}
          collisionPadding={Spacing.two}
          style={content}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            anchor.current?.querySelector<HTMLElement>('[role="button"]')?.focus();
          }}>
          <style href="sowocial-account-menu" precedence="default">
            {menuCss}
          </style>
          {sessions.map((s) => {
            const key = accountKey(s);
            const active = key === activeKey;
            return (
              <Menu.Item
                key={key}
                data-sowocial-account-item=""
                aria-current={active ? 'true' : undefined}
                onSelect={() => void choose(s)}
                style={item}>
                <Identity session={s} size={32} />
                {active && needsReconnect ? (
                  <ThemedText type="meta" themeColor="danger">
                    {t('profile.switcher.reconnectNeeded')}
                  </ThemedText>
                ) : (
                  active && (
                    <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} tintColor={theme.primary} />
                  )
                )}
              </Menu.Item>
            );
          })}
          <Menu.Separator style={{ height: 1, margin: `${Spacing.one}px ${Spacing.two}px`, background: theme.border }} />
          <Menu.Item data-sowocial-account-item="" onSelect={() => router.push('/add-account')} style={action}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={16} tintColor={theme.primary} />
            {t('profile.switcher.add')}
          </Menu.Item>
          <Menu.Item data-sowocial-account-item="" onSelect={() => router.push('/settings')} style={action}>
            <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={16} tintColor={theme.muted} />
            {t('profile.switcher.manage')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.oneHalf,
    minHeight: TouchTarget + Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  handle: {
    flexShrink: 1,
  },
  placeholder: {},
  alert: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});