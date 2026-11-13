import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { accountKey, useAuthedSession } from '@/auth/session';
import type { Post } from '@/model/post';
import { readItem, writeItem } from '@/utils/kv';
import { HOME_POSITION_PREFIX } from '@/utils/kv-keys';

import { useCapabilities } from './backend';
import { keys } from './keys';
import { useHomeMarker, useSaveMarker } from './ap/markers';

// Compared with isNewer: a status id on the fediverse, the post's time (ISO, so it sorts) on Bluesky.
export const homePosition = (post: Post) =>
  post.protocol === 'bsky' ? new Date(Date.parse(post.sortAt) || 0).toISOString() : post.cursor;

// Without server markers the position stays on this device, per account.
function useLocalPosition(enabled: boolean) {
  const key = accountKey(useAuthedSession());
  return useQuery({
    queryKey: keys.homePosition(key),
    queryFn: () => readItem(`${HOME_POSITION_PREFIX}${key}`),
    enabled,
  });
}

function useLocalSave() {
  const key = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  return useCallback(
    (position: string) => {
      writeItem(`${HOME_POSITION_PREFIX}${key}`, position);
      queryClient.setQueryData(keys.homePosition(key), position);
    },
    [key, queryClient],
  );
}

export function useHomePosition() {
  const { markers } = useCapabilities();
  const server = useHomeMarker();
  const local = useLocalPosition(!markers);
  return markers ? server : local;
}

export function useSaveHomePosition() {
  const { markers } = useCapabilities();
  const server = useSaveMarker('home');
  const local = useLocalSave();
  return markers ? server.mutate : local;
}
