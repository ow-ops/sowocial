import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';

import { useAccountScope } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { handlesError } from '../mutation-meta';
import { isNewer } from '../snowflake';

export { isNewer };

// One query serves both markers; a create answers with the updated marker only, so it merges.
function useMarkers<T>(select: (markers: Partial<mastodon.v1.Marker>) => T) {
  const { markers } = useCapabilities();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.markers(account),
    queryFn: () => getMasto(account).v1.markers.fetch({ timeline: ['home', 'notifications'] }),
    select,
    enabled: markers,
  });
}

const notificationsMarker = (markers: Partial<mastodon.v1.Marker>) => markers.notifications?.lastReadId;
const homeMarker = (markers: Partial<mastodon.v1.Marker>) => markers.home?.lastReadId;

const useLastReadNotificationId = () => useMarkers(notificationsMarker);

export const useHomeMarker = () => useMarkers(homeMarker);

const mergeMarkers = (old: Partial<mastodon.v1.Marker> | undefined, markers: Partial<mastodon.v1.Marker>) => ({
  ...old,
  ...markers,
});

export function useLatestNotificationId() {
  const { markers } = useCapabilities();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.latestNotification(account),
    queryFn: async () => (await getMasto(account).v1.notifications.list({ limit: 1 }))[0]?.id ?? null,
    enabled: markers,
  });
}

export function useNotificationsRead() {
  const { data: lastRead, isSuccess } = useLastReadNotificationId();
  const { data: latest } = useLatestNotificationId();
  return { lastRead, unread: isSuccess && !!latest && (!lastRead || isNewer(latest, lastRead)) };
}

// A conflict means another client saved at the same moment; the next save wins, so errors are dropped.
export function useSaveMarker(timeline: 'home' | 'notifications') {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return useMutation({
    meta: handlesError,
    mutationFn: (lastReadId: string) => getMasto(account).v1.markers.create({ [timeline]: { lastReadId } }),
    onSuccess: (markers) =>
      queryClient.setQueryData<Partial<mastodon.v1.Marker>>(keys.markers(account), (old) => mergeMarkers(old, markers)),
    onError: (error) => console.warn('Saving the read marker failed', error),
  });
}
