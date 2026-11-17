import { renderMarkdown } from '@/utils/markdown';

const freek =
  '<p>Buy buy buy<br />BUY THE ~~DIP~~ **STROOPWAFEL**<br /><a href="https://tiny.tilde.website/@crazazy/117628019177150607" target="_blank" rel="nofollow noopener" translate="no"><span class="invisible">https://</span><span class="ellipsis">tiny.tilde.website/@crazazy/11</span><span class="invisible">7628019177150607</span></a></p>';

it('renders inline markdown and keeps links', () => {
  expect(renderMarkdown(freek)).toBe(
    '<p>Buy buy buy<br />BUY THE <del>DIP</del> <strong>STROOPWAFEL</strong><br /><a href="https://tiny.tilde.website/@crazazy/117628019177150607" target="_blank" rel="nofollow noopener" translate="no"><span class="invisible">https://</span><span class="ellipsis">tiny.tilde.website/@crazazy/11</span><span class="invisible">7628019177150607</span></a></p>',
  );
});

it('formats each paragraph on its own', () => {
  expect(renderMarkdown('<p>**x**</p><p>*sigh* fine</p>')).toBe('<p><strong>x</strong></p><p><em>sigh</em> fine</p>');
  const unpaired = '<p>*oops</p><p>second*</p>';
  expect(renderMarkdown(unpaired)).toBe(unpaired);
});

it('leaves block syntax alone', () => {
  const html = '<p># Title</p><p>- one<br />- two</p><p>&gt; quoted **bold**</p>';
  expect(renderMarkdown(html)).toBe('<p># Title</p><p>- one<br />- two</p><p>&gt; quoted <strong>bold</strong></p>');
});

it('leaves plain and server-formatted posts alone', () => {
  const plain = '<p>Nothing to see, 2 * 3 = 6</p>';
  expect(renderMarkdown(plain)).toBe(plain);
  const formatted = '<p><strong>bold</strong> and **literal**</p>';
  expect(renderMarkdown(formatted)).toBe(formatted);
});

it('keeps escaped markup escaped', () => {
  expect(renderMarkdown('<p>**a** &lt;script&gt;</p>')).toBe('<p><strong>a</strong> &lt;script&gt;</p>');
  expect(renderMarkdown('<p>`&lt;b&gt; a&amp;b`</p>')).toBe('<p><code>&lt;b&gt; a&amp;b</code></p>');
});

it('leaves link text, mentions and shortcodes alone', () => {
  const html = renderMarkdown(
    '<p>**hi** <a href="https://x.test/"><span>_x_ *y*</span></a> <span class="h-card"><a href="https://m.test/@_u_" class="u-url mention">@<span>_u_</span></a></span> :_cat_:</p>',
  );
  expect(html).toContain('<strong>hi</strong>');
  expect(html).toContain('<span>_x_ *y*</span>');
  expect(html).toContain('@<span>_u_</span>');
  expect(html).toContain(':_cat_:');
});

it('shows a markdown link as its text and the real link', () => {
  const html = renderMarkdown('<p>**see** [docs](<a href="https://docs.test/x">https://docs.test/x</a>)</p>');
  expect(html).toBe('<p><strong>see</strong> docs (<a href="https://docs.test/x">https://docs.test/x</a>)</p>');
});

it('drops markdown images', () => {
  expect(renderMarkdown('<p>**see** ![cat](https://example.com/cat.png)</p>')).not.toContain('<img');
});
