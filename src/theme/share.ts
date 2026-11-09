import { Gunzip, gzipSync, strFromU8, strToU8 } from 'fflate';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';

import { MAX_THEME_FILE_BYTES } from './theme-file';

// Gzip, then URL-safe base64: a `+` in a query string comes back as a space.
export const encodeTheme = (css: string) =>
  btoa(strFromU8(gzipSync(strToU8(css), { mtime: 0 }), true))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function base64(value: string) {
  const standard = value.replace(/[- ]/g, '+').replace(/_/g, '/');
  return standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');
}

export function decodeTheme(value: string): string | null {
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const gunzip = new Gunzip((chunk) => {
      total += chunk.length;
      if (total > MAX_THEME_FILE_BYTES) throw new Error('theme too large once inflated');
      chunks.push(chunk);
    });
    gunzip.push(strToU8(atob(base64(value)), true), true);
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return strFromU8(out);
  } catch {
    return null;
  }
}

export const themeLink = (css: string) => Linking.createURL('theme', { queryParams: { css: encodeTheme(css) } });

const fileName = (name: string) => `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'theme'}.sowocial.css`;

export async function shareThemeFile(name: string, css: string) {
  const file = new File(Paths.cache, fileName(name));
  await file.write(css);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/css', UTI: 'public.plain-text', dialogTitle: name });
}

// `size` when the file is too large to be a theme; null when the user cancels.
export async function pickThemeFile(): Promise<{ name: string; css: string } | 'size' | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['text/css', 'text/plain', '*/*'] });
  if (result.canceled) return null;
  const [asset] = result.assets;
  if ((asset.size ?? 0) > MAX_THEME_FILE_BYTES) return 'size';
  const css = asset.file ? await asset.file.text() : await new File(asset.uri).text();
  return { name: asset.name.replace(/\.sowocial\.css$|\.css$/i, ''), css };
}
