import type { AppBskyFeedDefs } from '@atproto/api';

import { toPost } from '@/model/adapters/bsky';
import type { BskyPost } from '@/model/post';

export function bskyPost(overrides: Partial<AppBskyFeedDefs.PostView> = {}, record: object = {}): BskyPost {
  const post = toPost({
    uri: 'at://did:plc:author/app.bsky.feed.post/3kpost',
    cid: 'bafypost',
    author: { did: 'did:plc:author', handle: 'author.test' },
    record: { $type: 'app.bsky.feed.post', text: 'hello', createdAt: '2026-01-01T00:00:00.000Z', ...record },
    indexedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
  if (post.protocol !== 'bsky') throw new Error('expected a Bluesky post');
  return post;
}
