import type { BskyPost } from '@/model/post';

import { replyRefs } from './bsky/compose';
import type { PostOutcome, ReplyRef } from './backend/types';

export type Chain = { inReplyToId?: string; replyRef?: ReplyRef };

// Where the next post of a thread attaches after `outcome` was sent.
export function nextChain(outcome: PostOutcome, previous?: Chain, parent?: BskyPost): Chain | undefined {
  if (outcome.kind === 'created') return { inReplyToId: outcome.id };
  if (outcome.kind !== 'indexing') return previous;
  const root = previous?.replyRef?.root ?? (parent ? replyRefs(parent).root : outcome.ref);
  return { replyRef: { root, parent: outcome.ref } };
}
