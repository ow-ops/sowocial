import { t } from '@/i18n';
import { newThemeId } from '@/theme/store';
import { confirmAction } from '@/utils/dialog';
import { showError, showToast } from '@/utils/toast';

import { buildBackup, planRestore } from './backup';
import { pickBackupFile, shareBackupFile } from './share';
import { applySnapshot, readSnapshot } from './state';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : undefined);

export async function exportBackup() {
  try {
    await shareBackupFile(buildBackup(readSnapshot()));
  } catch (error) {
    showError(t('settings.backup.exportFailed'), messageOf(error));
  }
}

export async function importBackup() {
  let text: string | null;
  try {
    text = await pickBackupFile();
  } catch (error) {
    return showError(t('settings.backup.pickFailed'), messageOf(error));
  }
  if (text === null) return;
  const plan = planRestore(text, readSnapshot(), newThemeId);
  if ('error' in plan) return showError(t('settings.backup.importFailed'), t(`settings.backup.errors.${plan.error}`));
  confirmAction(
    t('settings.backup.importConfirm'),
    t('settings.backup.import'),
    () => {
      applySnapshot(plan.snapshot);
      showToast(t('settings.backup.imported'));
    },
    { destructive: false },
  );
}
