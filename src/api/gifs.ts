import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { keys } from './keys';

// Searches and files go through a soliditas server, so Klipy does not see who is searching.
const PROXY = process.env.EXPO_PUBLIC_GIF_PROXY_URL;
const KEY = process.env.EXPO_PUBLIC_KLIPY_API_KEY;

export const gifsAvailable = !!PROXY && !!KEY;

// The largest file soliditas passes through.
const MAX_BYTES = 8 * 1024 * 1024;

export type Gif = { id: string; title: string; url: string; preview: string; width: number; height: number; size: number };

type KlipyFile = { url?: string; width?: number; height?: number; size?: number };
type KlipyFormats = { gif?: KlipyFile; webp?: KlipyFile };
type KlipyItem = { id?: string | number; title?: string; file?: { md?: KlipyFormats; sm?: KlipyFormats; xs?: KlipyFormats } };

export function parseKlipy(payload: unknown): Gif[] {
  const items = (payload as { data?: { data?: unknown } } | null)?.data?.data;
  if (!Array.isArray(items)) return [];
  return (items as KlipyItem[]).flatMap(({ id, title, file }) => {
    const full = [file?.md?.gif, file?.sm?.gif].find((f) => f?.url && (f.size ?? 0) <= MAX_BYTES);
    const preview = file?.xs?.webp ?? file?.xs?.gif ?? full;
    if (id === undefined || !full?.url || !preview?.url) return [];
    return [{ id: String(id), title: title ?? '', url: full.url, preview: preview.url, width: full.width ?? 0, height: full.height ?? 0, size: full.size ?? 0 }];
  });
}

const proxy = (path: string, params: Record<string, string>) => `${PROXY}/_soliditas/gifs/${path}?${new URLSearchParams(params)}`;

export const gifMedia = (url: string) => proxy('media', { url });

export function useGifSearch(query: string) {
  return useQuery({
    queryKey: keys.gifSearch(query),
    queryFn: async ({ signal }) => {
      const res = await fetch(proxy('search', { provider: 'klipy', key: KEY!, q: query }), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseKlipy(await res.json());
    },
    enabled: gifsAvailable && query.length > 0,
    staleTime: 5 * 60_000,
  });
}

// A local file to attach like a picked image; on web the upload reads the proxied URL itself.
export async function downloadGif(gif: Gif) {
  if (Platform.OS === 'web') return gifMedia(gif.url);
  const file = await File.downloadFileAsync(gifMedia(gif.url), new File(Paths.cache, `gif-${gif.id}.gif`), { idempotent: true });
  return file.uri;
}
