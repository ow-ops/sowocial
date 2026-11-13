import type { AppBskyActorDefs, AppBskyFeedDefs } from '@atproto/api';

import { postId, postUri, toAuthor, toPage, toPost, toSegments, toThread } from '@/model/adapters/bsky';
import { contentToText } from '@/model/content';

import fixtures from './fixtures/bsky.json';

const view = (name: keyof typeof fixtures.posts) => fixtures.posts[name] as unknown as AppBskyFeedDefs.PostView;
const feed = fixtures.timeline.feed as unknown as AppBskyFeedDefs.FeedViewPost[];

describe('bsky ids', () => {
  it('turns an at:// URI into a route-safe id and back', () => {
    const uri = 'at://did:plc:alice111/app.bsky.feed.post/3krich';
    expect(postId(uri)).toBe('did:plc:alice111@3krich');
    expect(postUri('did:plc:alice111@3krich')).toBe(uri);
  });
});

describe('toSegments', () => {
  const post = toPost(view('rich'));
  const segments = post.content.kind === 'segments' ? post.content.segments : [];

  it('keeps facet offsets aligned after multi-byte text', () => {
    expect(segments).toEqual([
      { type: 'text', text: '👋 café 日本 ' },
      { type: 'link', text: 'https://example.com/a-very-long-path/that-gets-trimmed', url: 'https://example.com/a-very-long-path/that-gets-trimmed' },
      { type: 'text', text: ' ' },
      { type: 'tag', text: '#atproto', name: 'atproto' },
      { type: 'text', text: ' cc ' },
      { type: 'mention', text: '@bob.example.com', id: 'did:plc:bob22222' },
      { type: 'break' },
      { type: 'text', text: 'bye' },
    ]);
  });

  it('flattens to plain text', () => {
    expect(contentToText(post.content)).toBe(
      '👋 café 日本 https://example.com/a-very-long-path/that-gets-trimmed #atproto cc @bob.example.com bye',
    );
  });

  it('handles text without facets', () => {
    expect(toSegments('a\n\nb')).toEqual([
      { type: 'text', text: 'a' },
      { type: 'break' },
      { type: 'break' },
      { type: 'text', text: 'b' },
    ]);
  });
});

describe('toPost', () => {
  it('maps a plain post with viewer state, counts and cid', () => {
    const post = toPost(view('rich'));
    expect(post).toMatchObject({
      protocol: 'bsky',
      uid: 'bsky:at://did:plc:alice111/app.bsky.feed.post/3krich',
      id: 'did:plc:alice111@3krich',
      cid: 'bafyrich',
      uri: 'at://did:plc:alice111/app.bsky.feed.post/3krich',
      createdAt: '2024-06-01T12:00:00.000Z',
      counts: { replies: 2, reposts: 3, likes: 10 },
      viewer: { liked: true, reposted: false, likeUri: 'at://did:plc:me/app.bsky.feed.like/3klike' },
      language: 'en',
      url: 'https://bsky.app/profile/alice.bsky.social/post/3krich',
      author: { protocol: 'bsky', id: 'did:plc:alice111', handle: 'alice.bsky.social', displayName: 'Alice' },
      capabilities: { bookmark: true, edit: false, poll: false, visibility: false, pin: true, muteThread: false },
    });
    expect(post.tags).toEqual([{ name: 'atproto', url: 'https://bsky.app/hashtag/atproto' }]);
    expect(post.mentions).toEqual([{ id: 'did:plc:bob22222', handle: 'did:plc:bob22222', url: 'https://bsky.app/profile/did:plc:bob22222' }]);
  });

  it('maps images with alt text and aspect, and flags sensitive labels', () => {
    const post = toPost(view('images'));
    expect(post.sensitive).toBe(true);
    expect(post.media).toEqual([
      expect.objectContaining({ kind: 'image', alt: 'A red bicycle', aspect: 4 / 3, previewUrl: expect.stringContaining('feed_thumbnail'), url: expect.stringContaining('feed_fullsize') }),
      expect.objectContaining({ kind: 'image', alt: undefined, aspect: undefined }),
    ]);
    expect(new Set(post.media.map((m) => m.id)).size).toBe(2);
  });

  it('maps an external embed to a card', () => {
    expect(toPost(view('external')).card).toEqual({
      url: 'https://news.example.org/story',
      title: 'A story',
      description: 'Something happened',
      image: 'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:carol333/t@jpeg',
      provider: 'news.example.org',
    });
  });

  it('is quotable unless the author disabled embedding', () => {
    const post = view('quote');
    expect(toPost(post).viewer.quotable).toBe(true);
    expect(toPost({ ...post, viewer: { embeddingDisabled: true } }).viewer.quotable).toBe(false);
  });

  it('maps a quoted record, with its own media', () => {
    const post = toPost(view('quote'));
    expect(post.media).toEqual([]);
    expect(post.quote).toMatchObject({
      id: 'did:plc:alice111@3krich',
      author: { handle: 'alice.bsky.social' },
      counts: { reposts: 1, likes: 2 },
    });
    expect(contentToText(post.quote!.content)).toBe('original take');
    expect(post.quote!.media[0]).toMatchObject({ alt: 'quoted pic' });
  });

  it('maps record with media to a quote plus a video', () => {
    const post = toPost(view('recordWithMedia'));
    expect(post.quote?.id).toBe('did:plc:alice111@3krich');
    expect(post.media).toEqual([
      expect.objectContaining({ kind: 'video', url: expect.stringContaining('playlist.m3u8'), alt: 'A cat', aspect: 16 / 9 }),
    ]);
  });

  it('drops a quote the viewer cannot see', () => {
    expect(toPost(view('blockedQuote')).quote).toBeUndefined();
  });

  it('reads the reply parent from the record', () => {
    expect(toPost(view('reply')).replyTo).toEqual({
      id: 'did:plc:alice111@3krich',
      authorId: 'did:plc:alice111',
      handle: undefined,
    });
  });

  it('survives a record that is not a post', () => {
    const post = toPost({ ...view('rich'), record: { $type: 'app.bsky.feed.generator' } });
    expect(post.content).toEqual({ kind: 'segments', segments: [] });
  });
});

describe('toPage', () => {
  const page = toPage(feed, fixtures.timeline.cursor);

  it('turns a repost reason into repostedBy with its own key and sort time', () => {
    const reposted = page[1];
    expect(reposted.repostedBy).toMatchObject({ handle: 'carol.bsky.social', id: 'did:plc:carol333' });
    expect(reposted.key).toBe('bsky:at://did:plc:bob22222/app.bsky.feed.post/3kimg:did:plc:carol333');
    expect(reposted.uid).toBe('bsky:at://did:plc:bob22222/app.bsky.feed.post/3kimg');
    expect(reposted.sortAt).toBe('2024-06-01T18:00:00.000Z');
    expect(reposted.createdAt).toBe('2024-06-01T12:00:00.000Z');
  });

  it('adds the reply parent handle from the feed item', () => {
    expect(page[2].replyTo).toMatchObject({ id: 'did:plc:alice111@3krich', handle: 'alice.bsky.social' });
  });

  it('carries the response cursor on the last post only', () => {
    expect(page.at(-1)?.cursor).toBe('1717250000000::bafynext');
    expect(page.slice(0, -1).every((p) => p.cursor === p.uid)).toBe(true);
  });

  it('ends pagination when the response has no cursor', () => {
    expect(toPage(feed).at(-1)?.cursor).toBe('');
  });
});

describe('toAuthor', () => {
  const author = toAuthor(fixtures.profile as unknown as AppBskyActorDefs.ProfileViewDetailed);

  it('maps counts and images', () => {
    expect(author).toMatchObject({
      uid: 'bsky:did:plc:alice111',
      id: 'did:plc:alice111',
      handle: 'alice.bsky.social',
      header: expect.stringContaining('banner'),
      counts: { posts: 900, following: 80, followers: 120 },
      url: 'https://bsky.app/profile/alice.bsky.social',
    });
  });

  it('has no fields or roles and maps createdAt when present', () => {
    expect(author.fields).toBeUndefined();
    expect(author.roles).toBeUndefined();
    expect(author.createdAt).toBeUndefined();
    const dated = toAuthor({ ...fixtures.profile, createdAt: '2023-05-01T10:00:00.000Z' } as unknown as AppBskyActorDefs.ProfileViewDetailed);
    expect(dated.createdAt).toBe('2023-05-01T10:00:00.000Z');
  });

  it('detects links and tags in the bio, after an emoji', () => {
    const note = author.note?.kind === 'segments' ? author.note.segments : [];
    expect(note).toContainEqual({ type: 'link', text: 'https://example.com', url: 'https://example.com' });
    expect(note).toContainEqual({ type: 'tag', text: '#fun', name: 'fun' });
    expect(note).toContainEqual({ type: 'break' });
  });

  it('has no counts for a basic profile', () => {
    expect(toAuthor(fixtures.posts.rich.author as AppBskyActorDefs.ProfileViewBasic).counts).toBeUndefined();
  });
});

describe('toThread', () => {
  const { post, ancestors, descendants } = toThread(fixtures.thread.thread as unknown as AppBskyFeedDefs.ThreadViewPost);

  it('walks parents root first and stops at an unavailable post', () => {
    expect(post.id).toBe('did:plc:bob22222@3kmid');
    expect(ancestors.map((p) => p.id)).toEqual(['did:plc:alice111@3krich']);
  });

  it('flattens replies depth first and skips blocked posts', () => {
    expect(descendants.map((p) => p.id)).toEqual([
      'did:plc:carol333@3kext',
      'did:plc:bob22222@3knested',
      'did:plc:bob22222@3kquote',
    ]);
  });
});
