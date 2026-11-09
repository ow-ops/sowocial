import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { mastodon } from 'masto';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { usePagedList } from '../paged-list';
import { invalidateInfinite } from '../pagination';
import { handlesError } from '../mutation-meta';

type Tag = mastodon.v1.Tag;

export function useTag(name: string) {
  const { tags } = useCapabilities();
  return useQuery({
    queryKey: keys.tag(name),
    queryFn: () => getMasto().v1.tags.$select(name).fetch(),
    enabled: tags,
  });
}

export function useFollowedTags(enabled = true) {
  const { tags } = useCapabilities();
  return usePagedList(keys.followedTags, () => getMasto().v1.followedTags.list({ limit: 100 }), undefined, tags && enabled);
}

export function useSetTagFollowing() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: ({ name, follow }: { name: string; follow: boolean }) =>
      follow ? getMasto().v1.tags.$select(name).follow() : getMasto().v1.tags.$select(name).unfollow(),
    onMutate: async ({ name, follow }) => {
      await queryClient.cancelQueries({ queryKey: keys.tag(name) });
      const previous = queryClient.getQueryData<Tag>(keys.tag(name));
      if (previous) queryClient.setQueryData<Tag>(keys.tag(name), { ...previous, following: follow });
      return { previous };
    },
    onError: (_error, { name }, context) => {
      if (context?.previous) queryClient.setQueryData(keys.tag(name), context.previous);
    },
    onSuccess: (tag, { name, follow }) => {
      queryClient.setQueryData(keys.tag(name), tag);
      if (!follow) {
        queryClient.setQueryData<InfiniteData<Tag[], number>>(keys.followedTags, (old) =>
          old && { ...old, pages: old.pages.map((page) => page.filter((t) => t.name.toLowerCase() !== name.toLowerCase())) },
        );
      }
      queryClient.invalidateQueries({ queryKey: keys.followedTags });
      invalidateInfinite(queryClient, keys.timeline('home'));
    },
  });
}
