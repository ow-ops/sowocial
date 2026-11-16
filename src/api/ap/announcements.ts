import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { isUnsupported } from './unsupported';
import { toAnnouncement } from '@/model/adapters/announcement';
import type { Announcement } from '@/model/announcement';
import { applyReaction } from '@/model/reaction';

const STALE_MS = 5 * 60 * 1000;

// Servers without announcements (GoToSocial) answer 404, which reads as an empty list.
export function useAnnouncements() {
  const { serverInfo } = useCapabilities();
  const account = useAccountScope();
  return useQuery({
    queryKey: keys.announcements(account),
    queryFn: async () => {
      try {
        return (await getMasto(account).v1.announcements.list()).map(toAnnouncement);
      } catch (error) {
        if (isUnsupported(error)) return [];
        throw error;
      }
    },
    staleTime: STALE_MS,
    enabled: serverInfo,
  });
}

function useAnnouncementMutation<V extends { id: string }>(
  request: (account: string, variables: V) => Promise<unknown>,
  patch: (announcement: Announcement, variables: V) => Announcement,
) {
  const queryClient = useQueryClient();
  const account = useAccountScope();
  const key = keys.announcements(account);
  return useMutation({
    mutationFn: (variables: V) => request(account, variables),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Announcement[]>(key);
      queryClient.setQueryData<Announcement[]>(key, (list) =>
        list?.map((a) => (a.id === variables.id ? patch(a, variables) : a)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(key, context?.previous),
  });
}

export const useDismissAnnouncement = () =>
  useAnnouncementMutation(
    (account, { id }: { id: string }) => getMasto(account).v1.announcements.$select(id).dismiss(),
    (a) => ({ ...a, read: true }),
  );

export const useReactToAnnouncement = () =>
  useAnnouncementMutation(
    (account, { id, name, on }: { id: string; name: string; on: boolean }) => {
      const reaction = getMasto(account).v1.announcements.$select(id).reactions.$select(name);
      return on ? reaction.update() : reaction.remove();
    },
    (a, { name, on }) => ({ ...a, reactions: applyReaction(a.reactions, name, on) ?? [] }),
  );
