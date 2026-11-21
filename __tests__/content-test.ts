import { htmlContent, withoutQuoteLink } from '@/model/content';

describe('withoutQuoteLink', () => {
  const url = 'https://gts.example/@alice/statuses/01ABC';
  const link = `<a href="${url}" rel="nofollow">${url}</a>`;

  it('drops the RE: line at the end of a paragraph', () => {
    const content = htmlContent(`<p>Agreed.<br><br>RE: ${link}</p>`);
    expect(withoutQuoteLink(content, url)).toEqual(htmlContent('<p>Agreed.</p>'));
  });

  it('drops a paragraph that holds only the RE: line', () => {
    const content = htmlContent(`<p>Agreed.</p><p class="quote-inline">RE: ${link}</p>`);
    expect(withoutQuoteLink(content, url)).toEqual(htmlContent('<p>Agreed.</p>'));
  });

  it('keeps other links', () => {
    const content = htmlContent('<p>See <a href="https://example.com/a">this</a></p>');
    expect(withoutQuoteLink(content, url)).toEqual(content);
  });
});
