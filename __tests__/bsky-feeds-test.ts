import type { Agent, AppBskyActorDefs, AppBskyFeedDefs } from '@atproto/api';

import { bskySavedFeeds, feedId, feedUri } from '@/api/bsky/feed-data';
import { bskyFeedPage } from '@/api/bsky/feed-page';
import { postgateRules, threadgateAllow } from '@/api/bsky/compose';
import { byCursor, PAGE_SIZE } from '@/api/pagination';

const view = (n: number): AppBskyFeedDefs.FeedViewPost => ({
  post: {
    uri: `at://did:plc:author/app.bsky.feed.post/${n}`,
    cid: `bafy${n}`,
    author: { did: 'did:plc:author', handle: 'author.test' },
    record: { $type: 'app.bsky.feed.post', text: `post ${n}`, createdAt: '2026-01-01T00:00:00.000Z' },
    indexedAt: '2026-01-01T00:00:00.000Z',
  },
});

const FEED = 'at://did:plc:creator/app.bsky.feed.generator/cats';

describe('feed ids', () => {
  it('round-trips a generator uri', () => {
    expect(feedId(FEED)).toBe('did:plc:creator@cats');
    expect(feedUri('did:plc:creator@cats')).toBe(FEED);
  });
});

describe('bskyFeedPage', () => {
  const agent = (pages: Record<string, { feed: AppBskyFeedDefs.FeedViewPost[]; cursor?: string }>) => {
    const getFeed = jest.fn(async ({ cursor }: { cursor?: string }) => ({ data: pages[cursor ?? 'first'] }));
    return { agent: { app: { bsky: { feed: { getFeed } } } } as unknown as Agent, getFeed };
  };

  it('requests the feed with the cursor and stores the next cursor on the last post', async () => {
    const { agent: mock, getFeed } = agent({ first: { feed: [view(1), view(2)], cursor: 'c1' } });
    const page = await bskyFeedPage(mock, FEED);
    expect(getFeed).toHaveBeenCalledWith({ feed: FEED, limit: PAGE_SIZE, cursor: undefined });
    expect(page.map((p) => p.id)).toEqual(['did:plc:author@1', 'did:plc:author@2']);
    expect(byCursor.getNextPageParam(page)).toBe('c1');
  });

  it('stops paging when the feed has no cursor', async () => {
    const { agent: mock } = agent({ c1: { feed: [view(3)] } });
    const page = await bskyFeedPage(mock, FEED, 'c1');
    expect(byCursor.getNextPageParam(page)).toBeUndefined();
  });

  it('stops paging on an empty page', async () => {
    const { agent: mock } = agent({ first: { feed: [] } });
    expect(byCursor.getNextPageParam(await bskyFeedPage(mock, FEED))).toBeUndefined();
  });
});

describe('bskySavedFeeds', () => {
  const saved = (id: string, value: string, pinned: boolean, type = 'feed'): AppBskyActorDefs.SavedFeed => ({ id, type, value, pinned });
  const generator = (uri: string) => ({ uri, cid: 'c', did: 'did:web:gen', creator: { did: 'did:plc:creator', handle: 'creator.test' }, displayName: uri, indexedAt: '' });

  it('lists only feeds, pinned first, and drops feeds that no longer resolve', async () => {
    const a = 'at://did:plc:creator/app.bsky.feed.generator/a';
    const b = 'at://did:plc:creator/app.bsky.feed.generator/b';
    const gone = 'at://did:plc:creator/app.bsky.feed.generator/gone';
    const getFeedGenerators = jest.fn(async () => ({ data: { feeds: [generator(a), generator(b)] } }));
    const agent = { app: { bsky: { feed: { getFeedGenerators } } } } as unknown as Agent;
    const entries = await bskySavedFeeds(agent, [
      saved('1', 'timeline', true, 'timeline'),
      saved('2', a, false),
      saved('3', gone, true),
      saved('4', b, true),
    ]);
    expect(entries.map((e) => e.saved.id)).toEqual(['4', '2']);
    expect(getFeedGenerators).toHaveBeenCalledWith({ feeds: [a, gone, b] });
  });

  it('requests generators in chunks of 25', async () => {
    const uris = Array.from({ length: 30 }, (_, i) => `at://did:plc:creator/app.bsky.feed.generator/f${i}`);
    const getFeedGenerators = jest.fn(async ({ feeds }: { feeds: string[] }) => ({ data: { feeds: feeds.map(generator) } }));
    const agent = { app: { bsky: { feed: { getFeedGenerators } } } } as unknown as Agent;
    const entries = await bskySavedFeeds(agent, uris.map((u, i) => saved(String(i), u, false)));
    expect(getFeedGenerators.mock.calls.map(([p]) => p.feeds.length)).toEqual([25, 5]);
    expect(entries).toHaveLength(30);
  });
});

describe('reply and quote controls', () => {
  it('maps audiences to threadgate rules', () => {
    expect(threadgateAllow('everyone')).toBeUndefined();
    expect(threadgateAllow('following')).toEqual([{ $type: 'app.bsky.feed.threadgate#followingRule' }]);
    expect(threadgateAllow('mentioned')).toEqual([{ $type: 'app.bsky.feed.threadgate#mentionRule' }]);
    expect(threadgateAllow('nobody')).toEqual([]);
  });

  it('only writes a postgate when quotes are disabled', () => {
    expect(postgateRules(true)).toBeUndefined();
    expect(postgateRules(false)).toEqual([{ $type: 'app.bsky.feed.postgate#disableRule' }]);
  });
});
