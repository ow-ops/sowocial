import { Marked } from 'marked';

// Servers that already format posts send these tags, so their text is left alone.
const FORMATTED = /<(strong|b|em|i|del|s|code|pre|h[1-6]|ul|ol|blockquote)\b/i;
const MARKUP = /<(strong|em|del|code)\b/;
const SYNTAX = /\*\*|__|~~|`|\*[^\s*]|_[^\s_]/;
// Links, mentions and :shortcodes: stay as the server sent them; underscores in them are not emphasis.
const SHIELDED = /<a\b[^>]*>[\s\S]*?<\/a>|:[\w-]+:/g;
const SLOT = /\u{E000}(\d+)\u{E001}/gu;

const marked = new Marked({
  gfm: true,
  renderer: {
    // A markdown image would load any remote URL inline.
    image: ({ text }) => text,
    // The source is already escaped HTML, so code is passed through instead of escaped twice.
    codespan: ({ text }) => `<code>${text}</code>`,
    // The server already linked the URL, so [text](url) shows the text then that real link.
    link({ tokens, href }) {
      return `${this.parser.parseInline(tokens)} (${href})`;
    },
  },
});

// Inline marks only: block rules like "- " lists or "# " headings misfire on ordinary posts.
export function renderMarkdown(html: string) {
  if (FORMATTED.test(html) || !SYNTAX.test(html.replace(/<[^>]*>/g, ''))) return html;
  const kept: string[] = [];
  const out = html
    .replace(SHIELDED, (match) => `\u{E000}${kept.push(match) - 1}\u{E001}`)
    .split('</p><p>')
    .map((paragraph) => marked.parseInline(paragraph, { async: false }))
    .join('</p><p>')
    .replace(SLOT, (_, i: string) => kept[Number(i)]);
  return MARKUP.test(out) ? out : html;
}
