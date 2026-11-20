import type { Agent, AppBskyFeedDefs } from '@atproto/api';

import { bskySearch, bskyTimelinePage } from '@/api/bsky/read';
import { PAGE_SIZE } from '@/api/pagination';

const post = (n: number): AppBskyFeedDefs.PostView => ({
  uri: `at://did:plc:author/app.bsky.feed.post/${n}`,
  cid: `bafy${n}`,
  author: { did: 'did:plc:author', handle: 'author.test' },
  record: { $type: 'app.bsky.feed.post', text: `post ${n} #tag`, createdAt: '2026-01-01T00:00:00.000Z' },
  indexedAt: '2026-01-01T00:00:00.000Z',
});

const agentWith = (searchPosts: jest.Mock, searchActors = jest.fn(async () => ({ data: { actors: [] } }))) =>
  ({
    app: { bsky: { feed: { searchPosts } } },
    searchActors,
  }) as unknown as Agent;

describe('bskyTimelinePage for a tag', () => {
  it('lists the newest posts for the tag and keeps the cursor for the next page', async () => {
    const searchPosts = jest.fn(async () => ({ data: { posts: [post(1), post(2)], cursor: 'next' } }));
    const page = await bskyTimelinePage(agentWith(searchPosts), { tag: 'tag' }, 'first');

    expect(searchPosts).toHaveBeenCalledWith({ q: '#tag', sort: 'latest', limit: PAGE_SIZE, cursor: 'first' });
    expect(page.items).toHaveLength(2);
    expect(page.next).toBe('next');
  });
});

describe('bskySearch hashtags', () => {
  it('returns the tag when the query is a single hashtag', async () => {
    const results = await bskySearch(agentWith(jest.fn(async () => ({ data: { posts: [] } }))), '#Word');
    expect(results.hashtags).toEqual([{ name: 'Word' }]);
  });

  it('returns no tag for a plain query', async () => {
    const results = await bskySearch(agentWith(jest.fn(async () => ({ data: { posts: [] } }))), 'hello world');
    expect(results.hashtags).toEqual([]);
  });

  it('returns no tag when the hashtag is followed by other words', async () => {
    const results = await bskySearch(agentWith(jest.fn(async () => ({ data: { posts: [] } }))), '#word more');
    expect(results.hashtags).toEqual([]);
  });
});
