let mockNextId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${mockNextId++}` }));
jest.mock('@/utils/kv', () => {
  const items = new Map<string, string>();
  return {
    readItem: (key: string) => items.get(key) ?? null,
    writeItem: (key: string, value: string) => void items.set(key, value),
  };
});
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

import { fetch } from 'expo/fetch';

import { fetchCatalog, updateInstalled, type CatalogEntry } from '@/theme/catalog';
import { installThemeFile, themeStore } from '@/theme/store';
import { parseThemeFile } from '@/theme/theme-file';

const BASE = 'https://git.ow-ops.eu/ow-ops/sowocial-themes/raw/branch/main/';
const themeCss = (name: string, page = '#111111') =>
  `/*\n@sowocial-theme\nname: ${name}\nkind: dark\n*/\n:root { --sowocial-page: ${page}; }\n`;

const streamOf = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    getReader: () => ({
      read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes })),
      cancel: jest.fn(),
    }),
  };
};

const respond = (text: string, init: { ok?: boolean; body?: boolean } = {}) => ({
  ok: init.ok ?? true,
  status: 200,
  headers: { get: () => null },
  body: init.body === false ? null : streamOf(text),
});

const serve = (files: Record<string, string>) =>
  jest.mocked(fetch).mockImplementation((async (url: string) => respond(files[url] ?? '', { ok: url in files })) as never);

describe('fetchCatalog', () => {
  beforeEach(() => jest.mocked(fetch).mockReset());

  it('loads themes and tweaks listed in the catalog', async () => {
    serve({
      [`${BASE}catalog.json`]: JSON.stringify({
        themes: [{ basename: 'dusk', fullUrl: `${BASE}themes/dusk.css` }],
        tweaks: [{ basename: 'calm', fullUrl: `${BASE}tweaks/calm.css` }],
      }),
      [`${BASE}themes/dusk.css`]: themeCss('Dusk'),
      [`${BASE}tweaks/calm.css`]: '/*\n@sowocial-tweak\nname: Calm\n*/\n:root { --sowocial-primary: #c8b8ec; }\n',
    });
    const entries = await fetchCatalog();
    expect(entries.map((entry) => [entry.basename, entry.file.type])).toEqual([
      ['dusk', 'theme'],
      ['calm', 'tweak'],
    ]);
  });

  it('skips files outside the catalog repository and files that do not parse', async () => {
    serve({
      [`${BASE}catalog.json`]: JSON.stringify({
        themes: [
          { basename: 'elsewhere', fullUrl: 'https://evil.example/x.css' },
          { basename: 'broken', fullUrl: `${BASE}themes/broken.css` },
          { basename: 'missing', fullUrl: `${BASE}themes/missing.css` },
          { basename: 'dusk', fullUrl: `${BASE}themes/dusk.css` },
        ],
      }),
      [`${BASE}themes/broken.css`]: 'not a theme',
      [`${BASE}themes/dusk.css`]: themeCss('Dusk'),
    });
    expect((await fetchCatalog()).map((entry) => entry.basename)).toEqual(['dusk']);
  });

  it('fetches at most six files at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const rows = Array.from({ length: 20 }, (_, i) => ({ basename: `t${i}`, fullUrl: `${BASE}themes/t${i}.css` }));
    jest.mocked(fetch).mockImplementation((async (url: string) => {
      if (url.endsWith('catalog.json')) return respond(JSON.stringify({ themes: rows }));
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return respond(themeCss('T'));
    }) as never);
    expect(await fetchCatalog()).toHaveLength(20);
    expect(peak).toBe(6);
  });

  it('rejects when the catalog response has no body', async () => {
    jest.mocked(fetch).mockResolvedValue(respond('', { body: false }) as never);
    await expect(fetchCatalog()).rejects.toThrow('has no body');
  });
});

describe('updateInstalled', () => {
  const entry = (basename: string, css: string): CatalogEntry => {
    const file = parseThemeFile(css);
    if (typeof file === 'string') throw new Error(file);
    return { basename, url: `${BASE}themes/${basename}.css`, css, file };
  };

  it('replaces an installed catalog theme whose file changed, keeping its id', () => {
    const dusk = entry('dusk', themeCss('Dusk'));
    installThemeFile(dusk.css, dusk.basename, dusk.url);
    const [before] = themeStore.getState().themes;

    updateInstalled([entry('dusk', themeCss('Dusk', '#222222'))]);

    const { themes } = themeStore.getState();
    expect(themes).toHaveLength(1);
    expect(themes[0].id).toBe(before.id);
    expect(themes[0].css).toContain('#222222');
  });

  it('leaves themes the user did not install from the catalog alone', () => {
    const before = themeStore.getState();
    updateInstalled([entry('other', themeCss('Other'))]);
    expect(themeStore.getState()).toBe(before);
  });
});
