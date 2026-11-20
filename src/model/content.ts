import { firstLink } from '@/utils/links';
import { renderMarkdown } from '@/utils/markdown';

import type { Emoji } from './post';

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; id?: string; url?: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'tag'; text: string; name: string }
  | { type: 'emoji'; shortcode: string; url: string }
  | { type: 'paragraph' }
  | { type: 'break' };

export type RichContent =
  | { kind: 'html'; html: string; emojis: Emoji[] }
  | { kind: 'segments'; segments: Segment[] };

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

// Keeps line and paragraph breaks, for copying the text out.
export function contentToCopy(content: RichContent) {
  if (content.kind === 'segments') {
    return content.segments
      .map((s) => (s.type === 'paragraph' ? '\n\n' : s.type === 'break' ? '\n' : s.type === 'emoji' ? `:${s.shortcode}:` : s.text))
      .join('')
      .trim();
  }
  return content.html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
    .trim();
}

export const htmlContent = (html: string, emojis: Emoji[] = []): RichContent => ({ kind: 'html', html, emojis });

export function contentToText(content: RichContent) {
  if (content.kind === 'html') return htmlToText(renderMarkdown(content.html));
  return content.segments
    .map((s) => {
      switch (s.type) {
        case 'text':
        case 'mention':
        case 'link':
        case 'tag':
          return s.text;
        case 'emoji':
          return `:${s.shortcode}:`;
        case 'paragraph':
        case 'break':
          return ' ';
      }
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstContentLink(content: RichContent) {
  if (content.kind === 'html') return firstLink(content.html);
  return content.segments.find((s) => s.type === 'link')?.url;
}

const PRONOUN_LABELS = new Set(['pronouns', 'pronoun', 'pronoms', 'pronom', 'pronomen', 'pronombres', 'pronomi', 'pronomes', 'pronomina']);

export function pronounsFromFields(fields: { name: string; value: string }[]) {
  const field = fields.find((f) => PRONOUN_LABELS.has(f.name.toLowerCase().replace(/[^\p{L}]/gu, '')));
  const value = field && htmlToText(field.value);
  return value && value.length <= 40 ? value : undefined;
}
