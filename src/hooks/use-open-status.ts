import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { keys } from '@/api/keys';
import { accountKey, useActingKey, useSession } from '@/auth/session';
import { useOpenInDetail } from '@/hooks/use-open-in-detail';
import type { Post } from '@/model/post';

export function useOpenStatus() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const openInDetail = useOpenInDetail();
  const acting = useActingKey();
  const { session } = useSession();
  const active = session ? accountKey(session) : null;
  // Seeding the cache lets the thread and media viewer render without a fetch.
  return (status: Post, href: `/post/${string}` | `/media/${string}`) => {
    const owner = status.accountKey ?? acting;
    const cachedAs = owner ?? active;
    if (cachedAs) queryClient.setQueryData(keys.status(cachedAs, status.id), status);
    if (owner && owner !== active) {
      const account = encodeURIComponent(owner);
      router.push(`${href}${href.includes('?') ? '&' : '?'}account=${account}` as typeof href);
    } else if (openInDetail && href.startsWith('/post/')) openInDetail(status.id);
    else router.push(href);
  };
}
