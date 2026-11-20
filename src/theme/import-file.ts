import { t } from '@/i18n';
import { showError, showToast } from '@/utils/toast';

import { pickThemeFile } from './share';
import { installThemeFile } from './store';
import { themeFileError } from './theme-file';

export async function importThemeFile() {
  let picked;
  try {
    picked = await pickThemeFile();
  } catch (error) {
    return showError(t('settings.themes.pickFailed'), error instanceof Error ? error.message : undefined);
  }
  if (!picked) return;
  const error = picked === 'size' ? 'size' : installThemeFile(picked.css, picked.name);
  if (error) showError(t('settings.themes.importFailed'), themeFileError(error));
  else showToast(t('settings.themes.imported'));
}
