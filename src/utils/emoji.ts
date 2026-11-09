export type Emoji = { shortcode: string; url: string };

export const EMOJI_SIZE = 20;
export const SHORTCODE = /:([\w-]+):/g;

const escapeAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

// Replaces :shortcode: with <img> in text only: never inside tags or <code>/<pre>.
export function emojifyHtml(html: string, emojis: Emoji[]) {
  if (emojis.length === 0) return html;
  const byCode = new Map(emojis.map((e) => [e.shortcode, e.url]));
  let codeDepth = 0;

  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<(code|pre)\b/i.test(part)) codeDepth++;
        else if (/^<\/(code|pre)\s*>/i.test(part)) codeDepth = Math.max(0, codeDepth - 1);
        return part;
      }
      if (codeDepth > 0) return part;
      return part.replace(SHORTCODE, (match, code: string) => {
        const url = byCode.get(code);
        return url
          ? `<img src="${escapeAttribute(url)}" alt="${match}" width="${EMOJI_SIZE}" height="${EMOJI_SIZE}" />`
          : match;
      });
    })
    .join('');
}
