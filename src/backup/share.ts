import { MAX_BACKUP_BYTES } from '@/backup/backup';
import { t } from '@/i18n';
import { pickTextFile } from '@/utils/pick-file';
import { shareTextFile } from '@/utils/share-file';

export const shareBackupFile = (text: string) =>
  shareTextFile(`sowocial-backup-${new Date().toISOString().slice(0, 10)}.json`, text, {
    mimeType: 'application/json',
    UTI: 'public.json',
  });

// Null when the user cancels.
export async function pickBackupFile(): Promise<string | null> {
  const file = await pickTextFile(['application/json', 'text/plain', '*/*']);
  if (!file) return null;
  if (file.size > MAX_BACKUP_BYTES) throw new Error(t('settings.backup.errors.size'));
  return file.read();
}
