import { fetch } from 'expo/fetch';
import pLimit from 'p-limit';

import { installThemeFile, themeStore } from './store';
import { MAX_THEME_FILE_BYTES, parseThemeFile, type ThemeFile } from './theme-file';

// Same layout as Sable's themes repository: catalog.json lists files under themes/ and tweaks/.
const CATALOG_URL = 'https://git.ow-ops.eu/ow-ops/sowocial-themes/raw/branch/main/catalog.json';
const CATALOG_FILES = 'https://git.ow-ops.eu/ow-ops/sowocial-themes/raw/branch/';

const MAX_ROWS = 200;
const CONCURRENCY = 6;

export type CatalogEntry = { basename: string; url: string; css: string; file: ThemeFile };

// Only https files inside the catalog repository, so a catalog cannot point the app elsewhere.
function catalogFileUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href.startsWith(CATALOG_FILES) && !url.href.includes('/../') ? url.href : null;
  } catch {
    return null;
  }
}

async function text(url: string) {
  const response = await fetch(url, { credentials: 'omit', referrer: '' });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_THEME_FILE_BYTES) throw new Error(`${url} is too large`);
  if (!response.body) throw new Error(`${url} has no body`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > MAX_THEME_FILE_BYTES) {
      await reader.cancel();
      throw new Error(`${url} is too large`);
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return body + decoder.decode();
}

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const catalog = JSON.parse(await text(CATALOG_URL)) as { themes?: unknown; tweaks?: unknown };
  const rows = [catalog.themes, catalog.tweaks].flatMap((list) => (Array.isArray(list) ? list : [])).slice(0, MAX_ROWS);
  const limit = pLimit(CONCURRENCY);
  const entries = await Promise.all(
    rows.map((row: { basename?: unknown; fullUrl?: unknown }) =>
      limit(async () => {
        const url = catalogFileUrl(row?.fullUrl);
        if (!url || typeof row.basename !== 'string') return null;
        const css = await text(url).catch(() => '');
        const file = parseThemeFile(css);
        return typeof file === 'string' ? null : { basename: row.basename.slice(0, 128), url, css, file };
      }),
    ),
  );
  return entries.filter((entry): entry is CatalogEntry => entry !== null);
}

// Installed catalog files follow the catalog.
export function updateInstalled(entries: CatalogEntry[]) {
  const { themes, tweaks } = themeStore.getState();
  const installed = [...themes, ...tweaks];
  for (const entry of entries) {
    const current = installed.find((custom) => custom.source === entry.url);
    if (current && current.css !== entry.css) installThemeFile(entry.css, entry.basename, entry.url);
  }
}
