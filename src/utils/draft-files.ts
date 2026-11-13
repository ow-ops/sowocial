import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { t } from '@/i18n';
import { showError } from '@/utils/toast';

// Picker results live in the cache, which the system may clear; drafts keep copies in document storage.
// On web the picker hands out blob URLs that die with the page, so drafts keep text only.
export const KEEPS_FILES = Platform.OS !== 'web';

const directory = () => new Directory(Paths.document, 'drafts');

const copies = new Map<string, string>();

const reported = new Set<string>();

const isStored = (uri: string) => uri.startsWith(directory().uri);

// A copy of its own, unlike `persistFile`, which hands the same copy to every holder of a file.
export function copyFile(uri: string) {
  if (!KEEPS_FILES) return uri;
  const source = new File(uri);
  directory().create({ idempotent: true, intermediates: true });
  const target = new File(directory(), `${randomUUID()}${source.extension}`);
  source.copy(target);
  return target.uri;
}

export function persistFile(uri: string) {
  if (!KEEPS_FILES || isStored(uri)) return uri;
  const known = copies.get(uri);
  if (known && new File(known).exists) return known;
  const copy = copyFile(uri);
  copies.set(uri, copy);
  return copy;
}

export function keepFile(uri: string) {
  try {
    return persistFile(uri);
  } catch (error) {
    if (!reported.has(uri)) {
      reported.add(uri);
      showError(t('compose.drafts.copyFailed'), error instanceof Error ? error.message : undefined);
    }
    return uri;
  }
}

export function pruneFiles(referenced: Set<string>) {
  if (!KEEPS_FILES) return;
  const folder = directory();
  if (!folder.exists) return;
  for (const entry of folder.list()) if (entry instanceof File && !referenced.has(entry.uri)) entry.delete();
}

export function removeFile(uri: string) {
  if (!KEEPS_FILES || !isStored(uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
