import { MAX_THEME_FILE_BYTES, parseThemeFile, type ThemeFile } from './theme-file';

// Same layout as Sable's themes repository: catalog.json lists files under themes/ and tweaks/.
const CATALOG_URL = 'https://git.sable.moe/ow-ops/sowocial-themes/raw/branch/main/catalog.json';
const CATALOG_FILES = 'https://git.sable.moe/ow-ops/sowocial-themes/raw/branch/';

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
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return await response.text();
}

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const catalog = JSON.parse(await text(CATALOG_URL)) as { themes?: unknown; tweaks?: unknown };
  const rows = [catalog.themes, catalog.tweaks].flatMap((list) => (Array.isArray(list) ? list : []));
  const entries = await Promise.all(
    rows.map(async (row: { basename?: unknown; fullUrl?: unknown }) => {
      const url = catalogFileUrl(row?.fullUrl);
      if (!url || typeof row.basename !== 'string') return null;
      const css = await text(url).catch(() => '');
      const file = css.length <= MAX_THEME_FILE_BYTES ? parseThemeFile(css) : 'size';
      return typeof file === 'string' ? null : { basename: row.basename.slice(0, 128), url, css, file };
    }),
  );
  return entries.filter((entry): entry is CatalogEntry => entry !== null);
}
