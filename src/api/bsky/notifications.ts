import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';
import { useAppActive } from '@/hooks/use-app-active';

import { getBackend, useCapabilities } from '../backend';
import { getAgent } from '../clients';
import { keys } from '../keys';
import { handlesError } from '../mutation-meta';
import { invalidateInfinite } from '../pagination';

const UNREAD_POLL_INTERVAL = 60_000;

export function useBskyUnreadCount() {
  const { unreadCount } = useCapabilities();
  const appActive = useAppActive();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.bskyUnreadCount(account),
    queryFn: () => getBackend(account).unreadNotifications(),
    enabled: unreadCount,
    refetchInterval: appActive ? UNREAD_POLL_INTERVAL : false,
  });
}

export function useMarkBskyNotificationsSeen() {
  const account = useAccountScope();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (seenAt: string) => getAgent(account).updateSeenNotifications(seenAt),
    onError: (error) => console.warn('Marking notifications seen failed', error),
    onSuccess: () => {
      queryClient.setQueryData(keys.bskyUnreadCount(account), 0);
      invalidateInfinite(queryClient, keys.notifications(account));
    },
  });
}
