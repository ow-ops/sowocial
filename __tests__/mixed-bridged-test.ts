import { dropBridgedCopies, planPage } from '@/api/mixed';
import type { Post } from '@/model/post';

import { makePost } from './fixtures/mixed';

const BSKY_URL = 'https://bsky.app/profile/alice.bsky.social/post/3abc';
const AP_URL = 'https://mastodon.example/@alice/111';

const native = (protocol: 'ap' | 'bsky', id: string, at: number, url: string): Post => ({
  ...makePost(protocol, id, at),
  url,
});

const bridged = (protocol: 'ap' | 'bsky', id: string, at: number, url: string, original?: string): Post => ({
  ...makePost(protocol, id, at),
  url,
  bridgyOriginalUrl: original,
});

describe('bridged copies', () => {
  it('matches a fediverse copy of a Bluesky post by its bsky.app URL', () => {
    const bskyPost = native('bsky', 'n', 2000, BSKY_URL);
    const apCopy = bridged('ap', 'c', 2100, BSKY_URL);
    expect(dropBridgedCopies([bskyPost, apCopy])).toEqual([bskyPost]);
  });

  it('matches a Bluesky copy of a fediverse post by its bridgyOriginalUrl', () => {
    const apPost = native('ap', 'n', 2000, AP_URL);
    const bskyCopy = bridged('bsky', 'c', 2100, 'https://bsky.app/profile/alice.ap.brid.gy/post/3xyz', AP_URL);
    expect(dropBridgedCopies([apPost, bskyCopy])).toEqual([apPost]);
  });

  it('matches a fediverse copy that links to the Bluesky post by DID', () => {
    const bskyPost = native('bsky', 'n', 2000, BSKY_URL);
    const apCopy = bridged('ap', 'c', 2100, `https://bsky.app/profile/${bskyPost.author.id}/post/3abc`);
    expect(dropBridgedCopies([bskyPost, apCopy])).toEqual([bskyPost]);
  });

  it('does not match posts that have no URL', () => {
    const apPost = { ...makePost('ap', 'a', 2000), url: undefined } as unknown as Post;
    const bskyPost = native('bsky', 'b', 2100, BSKY_URL);
    expect(dropBridgedCopies([apPost, bskyPost])).toEqual([apPost, bskyPost]);
  });

  it('does not match two different posts by the same person', () => {
    const first = native('bsky', 'a', 2000, BSKY_URL);
    const second = native('ap', 'b', 2100, 'https://bsky.app/profile/alice.bsky.social/post/3def');
    expect(dropBridgedCopies([first, second])).toEqual([first, second]);
  });

  it('keeps the native post and drops the bridged copy within a page', () => {
    const bskyPost = native('bsky', 'n', 2000, BSKY_URL);
    const apCopy = bridged('ap', 'c', 2100, BSKY_URL);
    const page = planPage(undefined, {
      ap: { posts: [apCopy], next: null },
      bsky: { posts: [bskyPost], next: null },
    });
    expect(page.items.map((p) => p.key)).toEqual(['bsky:n']);
  });

  it('drops the Bluesky copy of a fediverse post in the other direction', () => {
    const apPost = native('ap', 'n', 2000, AP_URL);
    const bskyCopy = bridged('bsky', 'c', 2100, 'https://bsky.app/profile/alice.ap.brid.gy/post/3xyz', AP_URL);
    const page = planPage(undefined, {
      ap: { posts: [apPost], next: null },
      bsky: { posts: [bskyCopy], next: null },
    });
    expect(page.items.map((p) => p.key)).toEqual(['ap:n']);
  });

  it('drops a copy carried from an earlier page once its native post arrives', () => {
    const apFresh = native('ap', 'fresh', 5000, AP_URL.replace('111', '999'));
    const bskyCopy = bridged('bsky', 'c', 1000, 'https://bsky.app/profile/alice.ap.brid.gy/post/3xyz', AP_URL);
    const first = planPage(undefined, {
      ap: { posts: [apFresh], next: 'a' },
      bsky: { posts: [bskyCopy], next: 'b' },
    });
    expect(first.items.map((p) => p.key)).toEqual(['ap:fresh']);
    expect(first.next?.carry.map((p) => p.key)).toEqual(['bsky:c']);

    const apNative = native('ap', 'n', 1000, AP_URL);
    const second = planPage(first.next, { ap: { posts: [apNative], next: null } });
    expect(second.items.map((p) => p.key)).toEqual(['ap:n']);
  });

  it('keeps every post when the timeline has one protocol only', () => {
    const a = native('ap', 'a', 3000, AP_URL);
    const b = native('ap', 'b', 2000, AP_URL);
    const page = planPage(undefined, { ap: { posts: [a, b], next: null } });
    expect(page.items.map((p) => p.key)).toEqual(['ap:a', 'ap:b']);
  });
});
