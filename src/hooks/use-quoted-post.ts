import { useLinkedPost } from '@/api/statuses';
import { useAccountScope } from '@/auth/session';
import type { Post } from '@/model/post';
import { firstPostLink } from '@/utils/links';

// The post a post quotes: its own quote, or on the fediverse a post it links, as servers without quote posts write one.
export function useQuotedPost(status: Post) {
  const scope = useAccountScope();
  const link =
    status.protocol === 'ap' && !status.quote && status.content.kind === 'html' ? firstPostLink(status.content.html, status.url) : undefined;
  const linked = useLinkedPost(link, status.accountKey ?? scope, status.id);
  return { quote: status.quote ?? linked.data ?? undefined, resolving: linked.isLoading };
}
