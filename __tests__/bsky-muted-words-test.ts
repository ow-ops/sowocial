import type { Agent } from '@atproto/api';

import { bskyPinnedPost } from '@/api/bsky/read';
import { moderatedPost } from '@/model/moderation';
import { bskyPost } from './fixtures/bsky-agent';

jest.mock('@/auth/bsky-loader', () => {
  const { moderatePost, moderateProfile } = jest.requireActual('@atproto/api');
  return { getBskyModeration: () => ({ moderatePost, moderateProfile }) };
});

const opts = (expiresAt?: string) => ({
  userDid: 'did:plc:me',
  prefs: {
    adultContentEnabled: true,
    labels: {},
    labelers: [],
    mutedWords: [{ value: 'hello', targets: ['content'], actorTarget: 'all', expiresAt }],
    hiddenPosts: [],
  },
  labelDefs: {},
});

describe('muted words', () => {
  it('hides a matching post in lists', () => {
    expect(moderatedPost(bskyPost(), opts()).filters).toEqual([{ title: 'Muted word', action: 'hide' }]);
  });

  it('ignores an expired word', () => {
    expect(moderatedPost(bskyPost(), opts('2020-01-01T00:00:00.000Z')).filters).toBeUndefined();
  });
});

describe('bskyPinnedPost', () => {
  const view = bskyPost().raw!.bsky;
  const agent = (pinnedPost?: { uri: string; cid: string }) =>
    ({
      getProfile: jest.fn(async () => ({ data: { pinnedPost } })),
      getPosts: jest.fn(async () => ({ data: { posts: [view] } })),
    }) as unknown as Agent;

  it('returns nothing without a pinned post', async () => {
    expect(await bskyPinnedPost(agent(), 'did:plc:author')).toEqual([]);
  });

  it('loads the pinned post', async () => {
    const mock = agent({ uri: view.uri, cid: view.cid });
    const [post] = await bskyPinnedPost(mock, 'did:plc:author');
    expect(mock.getPosts).toHaveBeenCalledWith({ uris: [view.uri] });
    expect(post.id).toBe('did:plc:author@3kpost');
  });
});
