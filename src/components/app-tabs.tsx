import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation';
import { router, withLayoutContext } from 'expo-router';
import type { ParamListBase, TabNavigationState } from 'expo-router/react-navigation';
import { unstable_getMaterialSymbolSourceAsync, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, type ImageSourcePropType } from 'react-native';

import { useSessionProfile } from '@/api/accounts';
import { useCapabilities } from '@/api/backend';
import { useAuthedSession } from '@/auth/session';
import { useTabAvatar } from '@/components/tab-avatar';
import { useNotificationsUnread } from '@/hooks/use-notifications-unread';
import { useTheme } from '@/hooks/use-theme';
import { selectionHaptic, tapHaptic } from '@/utils/haptics';

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;

const BottomTabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

const ICONS = {
  home: { sf: 'house', selected: 'house.fill', md: 'home' },
  local: { sf: 'person.3', selected: 'person.3', md: 'groups' },
  search: { sf: 'magnifyingglass', selected: 'magnifyingglass', md: 'search' },
  notifications: { sf: 'bell', selected: 'bell.fill', md: 'notifications' },
  me: { sf: 'person.crop.circle', selected: 'person.crop.circle.fill', md: 'account_circle' },
} satisfies Record<string, { sf: SFSymbol; selected: SFSymbol; md: AndroidSymbol }>;

type Tab = keyof typeof ICONS;

// Android tab icons have to be images, so the Material symbols are rendered once.
function useMaterialIcons() {
  const [icons, setIcons] = useState<Partial<Record<Tab, ImageSourcePropType>>>({});
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    for (const [tab, { md }] of Object.entries(ICONS)) {
      void unstable_getMaterialSymbolSourceAsync(md, 24, 'white').then((source) => {
        if (source) setIcons((loaded) => ({ ...loaded, [tab]: source }));
      });
    }
  }, []);
  return icons;
}

export function AppTabs() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { localTimeline } = useCapabilities();
  const unread = useNotificationsUnread();
  const materialIcons = useMaterialIcons();
  const avatar = useSessionProfile(useAuthedSession()).data?.avatar;
  // Android tints every image tab icon, so the avatar would come out as a solid shape there.
  const [avatarIcon, drawAvatar] = useTabAvatar(Platform.OS === 'ios' ? avatar : undefined);

  const icon = (tab: Tab) => {
    if (Platform.OS === 'ios') return ({ focused }: { focused: boolean }) => ({ sfSymbol: focused ? ICONS[tab].selected : ICONS[tab].sf });
    const source = materialIcons[tab];
    return source ? () => source : undefined;
  };

  return (
    <>
      {drawAvatar}
      <BottomTabs
        sidebarAdaptable
        tabBarActiveTintColor={theme.primary}
        tabBarStyle={Platform.OS === 'ios' ? undefined : { backgroundColor: theme.page }}
        activeIndicatorColor={theme.surface}
        screenListeners={{ tabPress: selectionHaptic }}>
        <BottomTabs.Screen name="home" options={{ title: t('timeline.tabs.home'), tabBarIcon: icon('home') }} />
        <BottomTabs.Screen
          name="local"
          options={{ title: t('timeline.tabs.local'), tabBarIcon: icon('local'), tabBarItemHidden: !localTimeline }}
        />
        <BottomTabs.Screen name="search" options={{ title: t('timeline.tabs.search'), tabBarIcon: icon('search'), role: 'search' }} />
        <BottomTabs.Screen
          name="notifications"
          options={{
            title: t('timeline.tabs.notifications'),
            tabBarIcon: icon('notifications'),
            // A single space draws a dot rather than a count.
            tabBarBadge: unread ? ' ' : undefined,
            tabBarBadgeBackgroundColor: theme.danger,
            tabBarBadgeTextColor: theme.onPrimary,
          }}
        />
        <BottomTabs.Screen
          name="me"
          options={{
            title: t('timeline.tabs.profile'),
            tabBarIcon: avatarIcon ? () => avatarIcon : icon('me'),
            tabBarIconRenderingMode: avatarIcon ? 'original' : undefined,
          }}
          listeners={{
            tabLongPress: () => {
              tapHaptic();
              router.push('/accounts');
            },
          }}
        />
      </BottomTabs>
    </>
  );
}
