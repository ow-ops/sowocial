import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

// Null when the user cancels. `read` is separate so a caller can refuse by size before loading.
export async function pickTextFile(types: string[]) {
  const result = await DocumentPicker.getDocumentAsync({ type: types });
  if (result.canceled) return null;
  const [asset] = result.assets;
  return {
    name: asset.name,
    size: asset.size ?? 0,
    read: () => (asset.file ? asset.file.text() : new File(asset.uri).text()),
  };
}
