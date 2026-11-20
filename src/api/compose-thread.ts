import type { Post } from '@/model/post';

import type { ReplyRef } from './backend/draft';
import type { PostOutcome } from './backend/types';
import { replyRefs } from './bsky/compose';

export type Chain = { inReplyToId?: string; replyRef?: ReplyRef };

// Where the next post of a thread attaches after `outcome` was sent.
export function nextChain(outcome: PostOutcome, previous?: Chain, parent?: Post): Chain | undefined {
  if (outcome.kind === 'created') return { inReplyToId: outcome.id };
  if (outcome.kind !== 'indexing') return previous;
  const root = previous?.replyRef?.root ?? (parent?.protocol === 'bsky' ? replyRefs(parent).root : outcome.ref);
  return { replyRef: { root, parent: outcome.ref } };
}
