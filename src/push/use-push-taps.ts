import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

import { useSession } from '@/auth/session';

import { accountHash } from './payload';

export function usePushTaps(enabled: boolean) {
  const { session, sessions, switchAccount } = useSession();

  // Pushes carry a hash of the receiving account's token or DID; iOS pushes without one open the active account.
  const open = useEffectEvent(async (response: Notifications.NotificationResponse | null) => {
    const hash = response?.notification.request.content.data?.accountHash;
    const target = sessions.find((s) => accountHash(s) === hash);
    if (target && (!session || accountHash(session) !== hash)) await switchAccount(target);
    router.navigate('/notifications');
    Notifications.clearLastNotificationResponse();
  });

  useEffect(() => {
    if (!enabled) return;
    // A tap that launched the app arrives before the listener exists.
    const launch = Notifications.getLastNotificationResponse();
    if (launch) open(launch);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => open(response));
    return () => subscription.remove();
  }, [enabled]);
}
