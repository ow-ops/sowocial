import { Link, useRouter, useSegments } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { Button } from '@/components/button';
import { RailAccount } from '@/components/rail-account';
import { ThemedText } from '@/components/themed-text';
import { Radius, RailWidth, Spacing, TouchTarget } from '@/constants/theme';
import { useNotificationsUnread } from '@/hooks/use-notifications-unread';
import { useTheme } from '@/hooks/use-theme';

const ITEMS = [
  { name: 'home', href: '/home', icon: { ios: 'house', android: 'home', web: 'home' } },
  { name: 'local', href: '/local', icon: { ios: 'person.3', android: 'groups', web: 'groups' } },
  { name: 'search', href: '/search', icon: { ios: 'magnifyingglass', android: 'search', web: 'search' } },
  { name: 'notifications', href: '/notifications', icon: { ios: 'bell', android: 'notifications', web: 'notifications' } },
  { name: 'me', href: '/me', icon: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' } },
] as const satisfies readonly { name: string; href: string; icon: SymbolViewProps['name'] }[];

const LABELS = {
  home: 'timeline.tabs.home',
  local: 'timeline.tabs.local',
  search: 'timeline.tabs.search',
  notifications: 'timeline.tabs.notifications',
  me: 'timeline.tabs.profile',
} as const;

export function SideRail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const current = useSegments()[1];
  const { localTimeline } = useCapabilities();
  const unread = useNotificationsUnread();

  return (
    <View nativeID="sowocial-rail" role="navigation" aria-label={t('timeline.rail.label')} style={[styles.rail, { backgroundColor: theme.canvas }]}>
      <style href="sowocial-rail" precedence="default">
        {`#sowocial-rail a:focus-visible { outline: 2px solid ${theme.primary}; outline-offset: -2px; }`}
      </style>
      <ThemedText type="wordmark" style={styles.wordmark}>
        sowocial
      </ThemedText>
      <View style={styles.items}>
        {ITEMS.filter((item) => item.name !== 'local' || localTimeline).map((item) => {
          const label = t(LABELS[item.name]);
          const active = current === item.name;
          const flagged = item.name === 'notifications' && unread;
          return (
            <RailItem
              key={item.name}
              href={item.href}
              icon={item.icon}
              label={label}
              accessibilityLabel={flagged ? t('timeline.rail.unread', { label }) : label}
              active={active}
              flagged={!!flagged}
            />
          );
        })}
      </View>
      <Button label={t('timeline.compose.newPost')} onPress={() => router.push('/compose')} />
      <View style={styles.spacer} />
      <RailAccount />
    </View>
  );
}

function RailItem({
  href,
  icon,
  label,
  accessibilityLabel,
  active,
  flagged,
}: {
  href: (typeof ITEMS)[number]['href'];
  icon: SymbolViewProps['name'];
  label: string;
  accessibilityLabel: string;
  active: boolean;
  flagged: boolean;
}) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} asChild>
      <Pressable
        aria-current={active ? 'page' : undefined}
        accessibilityLabel={accessibilityLabel}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={StyleSheet.flatten([styles.item, (active || hovered) && { backgroundColor: theme.surface }])}>
        <View style={styles.icon}>
          <SymbolView name={icon} size={22} tintColor={active ? theme.primary : theme.text} />
          {flagged && <View style={[styles.dot, { backgroundColor: theme.danger, borderColor: theme.canvas }]} />}
        </View>
        <ThemedText type="label" style={{ color: active ? theme.heading : theme.text }}>
          {label}
        </ThemedText>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  rail: {
    flex: 1,
    width: RailWidth,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  spacer: {
    flex: 1,
  },
  icon: {
    width: 24,
    alignItems: 'center',
  },
  wordmark: {
    paddingHorizontal: Spacing.three,
  },
  items: {
    gap: Spacing.one,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
