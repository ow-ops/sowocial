import { bskyLink, firstLink, routeFor } from '@/utils/links';

describe('firstLink', () => {
  it('skips mentions and hashtags', () => {
    const html =
      '<p><span class="h-card"><a href="https://gts.example/@alice" class="u-url mention">@alice</a></span> ' +
      '<a href="https://gts.example/tags/rust" class="mention hashtag" rel="tag">#rust</a> ' +
      '<a href="https://example.com/a?b=1&amp;c=2" rel="nofollow noopener">example.com/a</a></p>';
    expect(firstLink(html)).toBe('https://example.com/a?b=1&c=2');
  });

  it('is undefined without a web link', () => {
    expect(firstLink('<p>hi <a href="mailto:a@b.c">mail</a></p>')).toBeUndefined();
  });
});

describe('bskyLink', () => {
  it('names the kind of bsky.app link', () => {
    expect(bskyLink('https://bsky.app/profile/alice.test')).toEqual({ kind: 'profile', handle: 'alice.test' });
    expect(bskyLink('https://bsky.app/profile/did:plc:abc/post/3k')).toEqual({ kind: 'post', handle: 'did:plc:abc', rkey: '3k' });
    expect(bskyLink('https://bsky.app/starter-pack/alice.test/3k/?x=1')).toEqual({ kind: 'starterPack', handle: 'alice.test', rkey: '3k' });
    expect(bskyLink('https://bsky.app/profile/alice.test/lists/3k')).toEqual({ kind: 'list', handle: 'alice.test', rkey: '3k' });
    expect(bskyLink('https://bsky.app/profile/did:plc:abc/lists/3k/?x=1')).toEqual({ kind: 'list', handle: 'did:plc:abc', rkey: '3k' });
  });

  it('ignores other links', () => {
    expect(bskyLink('https://example.com/profile/alice.test')).toBeNull();
    expect(bskyLink('https://bsky.app/profile/alice.test/feed/3k')).toBeNull();
  });
});

describe('routeFor', () => {
  it('maps a resolved link to its screen', () => {
    expect(routeFor({ type: 'status', id: '1' })).toBe('/post/1');
    expect(routeFor({ type: 'account', id: '2' })).toBe('/account/2');
    expect(routeFor({ type: 'list', id: 'd@3' })).toEqual({ pathname: '/lists/[id]', params: { id: 'd@3' } });
    expect(routeFor({ type: 'starterPack', id: 'd@4' })).toEqual({ pathname: '/starter-pack/[id]', params: { id: 'd@4' } });
  });
});
