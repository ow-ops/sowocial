import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { handlesError, toastFailure } from '../mutation-meta';

export function useScheduledStatuses() {
  const { scheduled } = useCapabilities();
  const account = useAccountScope();
  return useInfiniteQuery({
    queryKey: keys.scheduled(account),
    queryFn: async ({ pageParam }) => await getMasto(account).v1.scheduledStatuses.list({ limit: 20, maxId: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === 20 ? last.at(-1)?.id : undefined),
    enabled: scheduled,
  });
}

export function useInvalidateScheduled() {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  return () => queryClient.invalidateQueries({ queryKey: keys.scheduled(account) });
}

export function useCancelScheduled() {
  const invalidate = useInvalidateScheduled();
  const account = useAccountScope();
  return useMutation({
    meta: handlesError,
    mutationFn: (id: string) => getMasto(account).v1.scheduledStatuses.$select(id).remove(),
    onError: (error) => toastFailure('compose.scheduled.cancelFailed', error),
    onSuccess: invalidate,
  });
}

export function useRescheduleStatus() {
  const invalidate = useInvalidateScheduled();
  const account = useAccountScope();
  return useMutation({
    meta: handlesError,
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      getMasto(account).v1.scheduledStatuses.$select(id).update({ scheduledAt }),
    onError: (error) => toastFailure('compose.scheduled.rescheduleFailed', error),
    onSuccess: invalidate,
  });
}
