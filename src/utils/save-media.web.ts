// Browsers save images and videos from their own context menu.
export const canSaveMedia = false;

export async function saveMedia(_url: string) {
  return false;
}
