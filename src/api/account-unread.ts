import { useQueries } from '@tanstack/react-query';

import { accountKey } from '@/auth/account-key';
import type { Session } from '@/auth/types';
import { useAppActive } from '@/hooks/use-app-active';

import { getMasto } from './clients';
import { getBackend } from './backend';
import { capabilitiesFor } from './backend/capabilities';
import { keys } from './keys';
import { isNewer } from './snowflake';

const POLL_MS = 2 * 60_000;

async function hasUnread(session: Session) {
  const key = accountKey(session);
  if (capabilitiesFor(session.protocol).unreadCount) return (await getBackend(key).unreadNotifications()) > 0;
  const masto = getMasto(key);
  const [markers, [latest]] = await Promise.all([
    masto.v1.markers.fetch({ timeline: ['notifications'] }),
    masto.v1.notifications.list({ limit: 1 }),
  ]);
  const lastRead = markers.notifications?.lastReadId;
  return !!latest && (!lastRead || isNewer(latest.id, lastRead));
}

// The accounts other than the active one with notifications they have not seen; the active one has its tab badge.
export function useUnreadAccounts(sessions: Session[], activeKey: string | null): ReadonlySet<string> {
  const appActive = useAppActive();
  const others = sessions.filter((s) => accountKey(s) !== activeKey);
  return useQueries({
    queries: others.map((session) => {
      const { unreadCount, markers } = capabilitiesFor(session.protocol);
      return {
        queryKey: keys.accountUnread(accountKey(session)),
        queryFn: () => hasUnread(session),
        enabled: unreadCount || markers,
        refetchInterval: appActive ? POLL_MS : (false as const),
        retry: false,
      };
    }),
    combine: (results) => new Set(others.filter((_, i) => results[i].data === true).map(accountKey)),
  });
}
