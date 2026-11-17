import { Marked } from 'marked';

// Servers that already format posts send these tags, so their text is left alone.
const FORMATTED = /<(strong|b|em|i|del|s|code|pre|h[1-6]|ul|ol|blockquote)\b/i;
const MARKUP = /<(strong|em|del|code|pre|h[1-6]|ul|ol|blockquote|hr|table)\b/;
// Links, mentions and :shortcodes: stay as the server sent them; underscores in them are not emphasis.
const SHIELDED = /<a\b[^>]*>[\s\S]*?<\/a>|:[\w-]+:/g;
const SLOT = /\u{E000}(\d+)\u{E001}/gu;
const SYNTAX = /\*\*|__|~~|`|\*[^\s*]|^#{1,6} |^&gt; |^[-*+] |^\d+\. /m;

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // A markdown image would load any remote URL inline.
    image: ({ text }) => text,
    // The source is already escaped HTML, so code is passed through instead of escaped twice.
    codespan: ({ text }) => `<code>${text}</code>`,
    code: ({ text }) => `<pre><code>${text}</code></pre>`,
    // The server already linked the URL, so [text](url) shows the text then that real link.
    link({ tokens, href }) {
      return `${this.parser.parseInline(tokens)} (${href})`;
    },
  },
});

export function renderMarkdown(html: string) {
  if (FORMATTED.test(html) || !SYNTAX.test(html.replace(/<[^>]*>/g, ''))) return html;
  const source = html
    .replace(/^<p>|<\/p>$/g, '')
    .split('</p><p>')
    .map((paragraph) => paragraph.replace(/<br\s*\/?>/g, '\n').replace(/^&gt; /gm, '> '))
    .join('\n\n');
  const kept: string[] = [];
  const shielded = source.replace(SHIELDED, (match) => `\u{E000}${kept.push(match) - 1}\u{E001}`);
  const out = marked
    .parse(shielded, { async: false })
    .trim()
    .replace(SLOT, (_, i: string) => kept[Number(i)]);
  return MARKUP.test(out) ? out : html;
}
