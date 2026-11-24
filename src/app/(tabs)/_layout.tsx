import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useSessionProfile } from '@/api/accounts';
import { useCapabilities } from '@/api/backend';
import { useAuthedSession } from '@/auth/session';
import { useTabAvatar } from '@/components/tab-avatar';
import { TabsFrame } from '@/components/tabs-frame';
import { useNotificationsUnread } from '@/hooks/use-notifications-unread';
import { useTheme } from '@/hooks/use-theme';
import { selectionHaptic } from '@/utils/haptics';
import '@/theme/web-tabs';

export default function TabLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { localTimeline } = useCapabilities();
  const unread = useNotificationsUnread();
  const avatar = useSessionProfile(useAuthedSession()).data?.avatar;
  // Android tints every image tab icon, so the avatar would come out as a solid shape there.
  const [avatarIcon, drawAvatar] = useTabAvatar(Platform.OS === 'ios' ? avatar : undefined);
  return (
    <TabsFrame>
      {drawAvatar}
      <NativeTabs
        sidebarAdaptable
        tintColor={theme.primary}
        backgroundColor={Platform.OS === 'ios' ? undefined : theme.page}
        indicatorColor={theme.surface}
        badgeBackgroundColor={theme.danger}
        badgeTextColor={theme.onPrimary}
        screenListeners={{ tabPress: selectionHaptic }}
        labelStyle={{ selected: { color: theme.heading } }}>
        <NativeTabs.Trigger name="home">
          <NativeTabs.Trigger.Label>{t('timeline.tabs.home')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="local" hidden={!localTimeline}>
          <NativeTabs.Trigger.Label>{t('timeline.tabs.local')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="person.3" md="groups" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search" role="search">
          <NativeTabs.Trigger.Label>{t('timeline.tabs.search')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="notifications">
          <NativeTabs.Trigger.Label>{t('timeline.tabs.notifications')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} md="notifications" />
          <NativeTabs.Trigger.Badge hidden={!unread} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="me">
          <NativeTabs.Trigger.Label>{t('timeline.tabs.profile')}</NativeTabs.Trigger.Label>
          {avatarIcon ? (
            <NativeTabs.Trigger.Icon src={avatarIcon} renderingMode="original" />
          ) : (
            <NativeTabs.Trigger.Icon
              sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
              md="account_circle"
            />
          )}
        </NativeTabs.Trigger>
      </NativeTabs>
    </TabsFrame>
  );
}
