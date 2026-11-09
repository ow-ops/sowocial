import { firstLink } from '@/utils/links';

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
