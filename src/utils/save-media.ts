import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

export const canSaveMedia = true;

// Add-only access: the app never reads the library.
export async function saveToLibrary(uri: string) {
  const { granted } = await requestPermissionsAsync(true);
  if (!granted) return false;
  await Asset.create(uri);
  return true;
}

export async function saveMedia(url: string) {
  const folder = new Directory(Paths.cache, 'saved-media');
  folder.create({ idempotent: true });
  const file = await File.downloadFileAsync(url, folder, { idempotent: true });
  try {
    return await saveToLibrary(file.uri);
  } finally {
    file.delete();
  }
}
