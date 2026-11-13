import type { ShareFileOptions } from './share-file';

export async function shareTextFile(name: string, text: string, { mimeType }: ShareFileOptions) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
