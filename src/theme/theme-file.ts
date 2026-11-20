import { Colors, type ThemeColor } from '@/constants/theme';
import { t } from '@/i18n';

// `.sowocial.css` files use the Sable theme header with sowocial's own tokens:
//
// /*
// @sowocial-theme
// name: Dusk
// author: someone
// kind: dark
// contrast: low
// tags: purple, calm
// */
// :root { --sowocial-page: #0c0a14; --sowocial-primary: #c8b8ec; }
//
// A `@sowocial-tweak` sets only some tokens and applies on top of the active theme.

export const MAX_THEME_FILE_BYTES = 1024 * 1024;

export const TOKENS = Object.keys(Colors.dark) as ThemeColor[];

export type ThemeKind = 'light' | 'dark';
type ThemeTokens = Partial<Record<ThemeColor, string>>;

type ThemeMeta = {
  name: string | null;
  author: string | null;
  description: string | null;
  // A tweak without `kind` applies to both.
  kind: ThemeKind | null;
  contrast: 'low' | 'high';
  tags: string[];
};

export type ThemeFile = { type: 'theme' | 'tweak'; meta: ThemeMeta; tokens: ThemeTokens };
export type ThemeFileError = 'size' | 'header' | 'empty';

const COLOR = /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|(?:rgb|hsl)a?\([\d\s.,%/]+\))$/i;
const ROOT = /^(?::root|html|body)$/;
const PREFIX = '--sowocial-';

const kebab = (token: string) => token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const PROPERTY = new Map(TOKENS.map((token) => [`${PREFIX}${kebab(token)}`, token]));

export const isColor = (value: string) => value.length <= 64 && COLOR.test(value);

// Header fields live in the file's first comment.
function readField(header: string, name: string) {
  return header.match(new RegExp(`^[ \\t]*${name}:[ \\t]*(.+)$`, 'im'))?.[1]?.trim().slice(0, 200) || null;
}

function themeMeta(css: string): ThemeMeta {
  const open = css.indexOf('/*');
  const close = open === -1 ? -1 : css.indexOf('*/', open + 2);
  const header = close === -1 ? '' : css.slice(open + 2, close);
  const field = (name: string) => readField(header, name);
  const kind = field('kind');
  return {
    name: field('name'),
    author: field('author'),
    description: field('description'),
    kind: kind === 'dark' || kind === 'light' ? kind : null,
    contrast: field('contrast') === 'high' ? 'high' : 'low',
    tags: (field('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function stripComments(css: string) {
  let out = '';
  let from = 0;
  for (let open = css.indexOf('/*'); open !== -1; open = css.indexOf('/*', from)) {
    out += css.slice(from, open);
    const close = css.indexOf('*/', open + 2);
    if (close === -1) return out;
    from = close + 2;
  }
  return out + css.slice(from);
}

// Walks the innermost `selector { declarations }` blocks in one pass.
function* blocks(css: string) {
  let selectorStart = 0;
  let selector = '';
  let bodyStart = -1;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      selector = css.slice(selectorStart, i);
      bodyStart = i + 1;
      selectorStart = i + 1;
    } else if (css[i] === '}') {
      if (bodyStart !== -1) yield [selector, css.slice(bodyStart, i)] as const;
      bodyStart = -1;
      selectorStart = i + 1;
    }
  }
}

// Only custom properties on the document root mean anything outside a browser.
function themeTokens(css: string): ThemeTokens {
  const tokens: ThemeTokens = {};
  for (const [selector, declarations] of blocks(stripComments(css))) {
    if (!selector.split(',').every((part) => ROOT.test(part.trim()))) continue;
    for (const declaration of declarations.split(';')) {
      const separator = declaration.indexOf(':');
      if (separator === -1) continue;
      const token = PROPERTY.get(declaration.slice(0, separator).trim());
      const value = declaration.slice(separator + 1).trim();
      if (token && isColor(value)) tokens[token] = value;
    }
  }
  return tokens;
}

export function parseThemeFile(css: string): ThemeFile | ThemeFileError {
  if (css.length > MAX_THEME_FILE_BYTES) return 'size';
  const type = css.includes('@sowocial-tweak') ? 'tweak' : css.includes('@sowocial-theme') ? 'theme' : null;
  if (!type) return 'header';
  const tokens = themeTokens(css);
  if (Object.keys(tokens).length === 0) return 'empty';
  const meta = themeMeta(css);
  // A theme always belongs to light or dark; Sable reads a missing kind as light.
  if (type === 'theme' && !meta.kind) meta.kind = 'light';
  return { type, meta, tokens };
}

export function serializeThemeFile({ type, meta, tokens }: ThemeFile) {
  const header = [
    `@sowocial-${type}`,
    ...(['name', 'author', 'description', 'kind'] as const).flatMap((key) =>
      meta[key] ? [`${key}: ${meta[key]}`] : [],
    ),
    ...(type === 'theme' ? [`contrast: ${meta.contrast}`] : []),
    ...(meta.tags.length ? [`tags: ${meta.tags.join(', ')}`] : []),
  ];
  const body = TOKENS.flatMap((token) =>
    tokens[token] ? [`  ${PREFIX}${kebab(token)}: ${tokens[token]};`] : [],
  );
  return `/*\n${header.join('\n')}\n*/\n\n:root {\n${body.join('\n')}\n}\n`;
}

export const themeFileError = (error: ThemeFileError) => t(`settings.themes.errors.${error}`);
