import { appPostPath, bskyLink, firstLink, firstPostLink, originalUrl, routeFor, sameUrl } from '@/utils/links';

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

describe('firstPostLink', () => {
  const own = 'https://gts.example/@bob/statuses/01OWN';
  const html = (...hrefs: string[]) => '<p>' + hrefs.map((href) => `<a href="${href}" rel="nofollow">${href}</a>`).join(' ') + '</p>';

  it('passes over links to other pages for the first post link', () => {
    expect(firstPostLink(html('https://example.com/news', 'https://gts.example/@alice/statuses/01ABC'), own)).toBe(
      'https://gts.example/@alice/statuses/01ABC',
    );
  });

  it('knows the post URLs of Mastodon, Akkoma and Misskey', () => {
    for (const url of ['https://m.example/@alice/1123', 'https://a.example/notice/AbC', 'https://k.example/notes/9abc', 'https://m.example/users/alice/statuses/1']) {
      expect(firstPostLink(html(url), own)).toBe(url);
    }
  });

  it('skips profiles, profile pages and the post itself', () => {
    expect(firstPostLink(html('https://m.example/@alice', 'https://m.example/@alice/with_replies', own), own)).toBeUndefined();
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

describe('sameUrl', () => {
  it('matches the linked post itself, not a post that contains the link', () => {
    expect(sameUrl('https://m.example/@alice/1123/', 'https://m.example/@alice/1123')).toBe(true);
    expect(sameUrl('https://gts.example/@bob/statuses/01OTHER', 'https://m.example/@alice/1123')).toBe(false);
    expect(sameUrl(null, 'https://m.example/@alice/1123')).toBe(false);
  });
});

describe('appPostPath', () => {
  it('keeps the original URL behind the server segment', () => {
    for (const url of ['https://gts.hayden.moe/@hayden/statuses/01M87Q2XTCZM5PVVC5PYRE733X', 'https://m.example/@alice/1123', 'https://k.example/notes/9abc']) {
      const [server, ...path] = appPostPath(url)!.slice(1).split('/');
      expect(originalUrl(server, path)).toBe(url);
    }
  });

  it('gives up on URLs the route could not rebuild', () => {
    for (const url of [
      'https://m.example:8443/@alice/1',
      'http://m.example/@alice/1',
      'https://blog.example/?p=123',
      'https://k.example/notes/9abc/',
      'https://m.example/@alice%40x/1',
      'https://m.example/',
      'not a url',
    ]) {
      expect(appPostPath(url)).toBeNull();
    }
  });
});
