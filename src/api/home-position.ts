import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';

import { accountKey, useAuthedSession } from '@/auth/session';
import type { Post } from '@/model/post';
import { readItem, writeItem } from '@/utils/kv';
import { HOME_POSITION_PREFIX } from '@/utils/kv-keys';
import type { TimelinePost } from '@/utils/timeline';

import { useCapabilities } from './backend';
import { keys } from './keys';
import { useHomeMarker, useSaveMarker } from './ap/markers';

// A position is compared with isNewer, so it is a string that sorts by age.
export type HomePosition = {
  of: (post: Post) => string;
  marker: Pick<UseQueryResult<string | null | undefined>, 'data' | 'isFetchedAfterMount'>;
  save: (position: string) => void;
};

const timePosition = (post: Post) => new Date(Date.parse(post.sortAt) || 0).toISOString();

// A status id on the fediverse, the post's time on Bluesky. A reply chain counts as its newest post,
// so a saved position never moves back.
export const homePosition = (post: Post) =>
  post.protocol === 'bsky' ? timePosition(post) : ((post as TimelinePost).joined?.newest ?? post.cursor);

// Without server markers the position stays on this device.
function useLocalMarker(id: string, enabled = true) {
  const queryClient = useQueryClient();
  const marker = useQuery({
    queryKey: keys.homePosition(id),
    queryFn: () => readItem(`${HOME_POSITION_PREFIX}${id}`),
    enabled,
  });
  const save = useCallback(
    (position: string) => {
      writeItem(`${HOME_POSITION_PREFIX}${id}`, position);
      queryClient.setQueryData(keys.homePosition(id), position);
    },
    [id, queryClient],
  );
  return { marker, save };
}

export function useAccountHomePosition(): HomePosition {
  const { markers } = useCapabilities();
  const server = useHomeMarker();
  const saveServer = useSaveMarker('home');
  const local = useLocalMarker(accountKey(useAuthedSession()), !markers);
  return { of: homePosition, ...(markers ? { marker: server, save: saveServer.mutate } : local) };
}

// Posts of two networks are only comparable by time, and no server marker holds one.
export function useMixedHomePosition(apKey: string, bskyKey: string): HomePosition {
  return { of: timePosition, ...useLocalMarker(`mixed:${apKey}:${bskyKey}`) };
}
