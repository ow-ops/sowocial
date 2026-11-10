import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  return useQuery({
    queryKey: keys.announcements,
    queryFn: async () => {
      try {
        return (await getMasto().v1.announcements.list()).map(toAnnouncement);
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
  request: (variables: V) => Promise<unknown>,
  patch: (announcement: Announcement, variables: V) => Announcement,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: keys.announcements });
      const previous = queryClient.getQueryData<Announcement[]>(keys.announcements);
      queryClient.setQueryData<Announcement[]>(keys.announcements, (list) =>
        list?.map((a) => (a.id === variables.id ? patch(a, variables) : a)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(keys.announcements, context?.previous),
  });
}

export const useDismissAnnouncement = () =>
  useAnnouncementMutation(
    ({ id }: { id: string }) => getMasto().v1.announcements.$select(id).dismiss(),
    (a) => ({ ...a, read: true }),
  );

export const useReactToAnnouncement = () =>
  useAnnouncementMutation(
    ({ id, name, on }: { id: string; name: string; on: boolean }) => {
      const reaction = getMasto().v1.announcements.$select(id).reactions.$select(name);
      return on ? reaction.update() : reaction.remove();
    },
    (a, { name, on }) => ({ ...a, reactions: applyReaction(a.reactions, name, on) ?? [] }),
  );
