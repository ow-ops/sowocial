import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type ShareFileOptions = { mimeType: string; UTI: string; dialogTitle?: string };

export async function shareTextFile(name: string, text: string, options: ShareFileOptions) {
  const file = new File(Paths.cache, name);
  await file.write(text);
  await Sharing.shareAsync(file.uri, options);
}
