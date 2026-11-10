import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppActive } from '@/hooks/use-app-active';

import { getBackend, useCapabilities } from '../backend';
import { useBsky } from '../client';
import { keys } from '../keys';
import { handlesError } from '../mutation-meta';
import { invalidateInfinite } from '../pagination';

const UNREAD_POLL_INTERVAL = 60_000;

export function useBskyUnreadCount() {
  const { unreadCount } = useCapabilities();
  const appActive = useAppActive();
  return useQuery({
    queryKey: keys.bskyUnreadCount,
    queryFn: () => getBackend().unreadNotifications(),
    enabled: unreadCount,
    refetchInterval: appActive ? UNREAD_POLL_INTERVAL : false,
  });
}

export function useMarkBskyNotificationsSeen() {
  const agent = useBsky();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (seenAt: string) => agent.updateSeenNotifications(seenAt),
    onError: (error) => console.warn('Marking notifications seen failed', error),
    onSuccess: () => {
      queryClient.setQueryData(keys.bskyUnreadCount, 0);
      invalidateInfinite(queryClient, keys.notifications);
    },
  });
}
