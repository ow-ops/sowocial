import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

import { useSession } from '@/auth/session';

import { tokenHash } from './payload';

export function usePushTaps(enabled: boolean) {
  const { session, sessions, switchAccount } = useSession();

  // Android pushes carry a hash of the receiving account's token; iOS pushes don't, so they open the active account.
  const open = useEffectEvent(async (response: Notifications.NotificationResponse | null) => {
    const hash = response?.notification.request.content.data?.accountHash;
    const target = sessions.find((s) => s.protocol === 'ap' && tokenHash(s.token) === hash);
    const current = session?.protocol === 'ap' ? session.token : undefined;
    if (target?.protocol === 'ap' && target.token !== current) await switchAccount(target);
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
