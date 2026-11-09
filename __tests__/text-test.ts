import { emojifyHtml } from '@/utils/emoji';
import { isWebUrl, looksLikeFediverseUrl } from '@/utils/links';
import { shortRelativeTime } from '@/utils/relative-time';
import { countCharacters } from '@/utils/text';

describe('countCharacters', () => {
  it('counts links as a fixed length', () => {
    expect(countCharacters('see https://example.org/a/very/long/path', 23)).toBe(4 + 23);
  });

  it('counts emoji as single characters', () => {
    expect(countCharacters('🦥🦥', 23)).toBe(2);
  });
});

describe('emojifyHtml', () => {
  const emojis = [{ shortcode: 'sloth', url: 'https://cdn.example/sloth.png' }];

  it('replaces known shortcodes in text', () => {
    expect(emojifyHtml('<p>hi :sloth:</p>', emojis)).toBe(
      '<p>hi <img src="https://cdn.example/sloth.png" alt=":sloth:" width="20" height="20" /></p>',
    );
  });

  it('leaves attributes, code and unknown shortcodes alone', () => {
    const html = '<a title=":sloth:">x</a><code>:sloth:</code> :other:';
    expect(emojifyHtml(html, emojis)).toBe(html);
  });
});

describe('links', () => {
  it('only treats http(s) as web URLs', () => {
    expect(isWebUrl('https://example.org')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('intent://scan')).toBe(false);
  });

  it('recognises fediverse post and profile URLs', () => {
    expect(looksLikeFediverseUrl('https://gts.example/@me/statuses/01H')).toBe(true);
    expect(looksLikeFediverseUrl('https://mastodon.social/@user/123')).toBe(true);
    expect(looksLikeFediverseUrl('https://example.org/blog/post')).toBe(false);
  });
});

describe('shortRelativeTime', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  it('formats compact durations', () => {
    expect(shortRelativeTime('2026-11-04T11:59:30Z', now)).toBe('now');
    expect(shortRelativeTime('2026-11-04T11:55:00Z', now)).toBe('5m');
    expect(shortRelativeTime('2026-11-04T09:00:00Z', now)).toBe('3h');
    expect(shortRelativeTime('2026-11-01T12:00:00Z', now)).toBe('3d');
  });
});
