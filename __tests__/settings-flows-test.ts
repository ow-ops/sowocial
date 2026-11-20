jest.mock('@/backup/share', () => ({ pickBackupFile: jest.fn(), shareBackupFile: jest.fn() }));
jest.mock('@/backup/state', () => ({ readSnapshot: jest.fn(() => ({ marker: 'current' })), applySnapshot: jest.fn() }));
jest.mock('@/backup/backup', () => ({ buildBackup: jest.fn(() => 'backup-text'), planRestore: jest.fn() }));
jest.mock('@/theme/share', () => ({ pickThemeFile: jest.fn() }));
jest.mock('@/theme/store', () => ({ installThemeFile: jest.fn(), newThemeId: jest.fn() }));
jest.mock('@/utils/dialog', () => ({ confirmAction: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showError: jest.fn(), showToast: jest.fn() }));

import { buildBackup, planRestore } from '@/backup/backup';
import { pickBackupFile, shareBackupFile } from '@/backup/share';
import { applySnapshot } from '@/backup/state';
import { exportBackup, importBackup } from '@/backup/transfer';
import { importThemeFile } from '@/theme/import-file';
import { pickThemeFile } from '@/theme/share';
import { installThemeFile } from '@/theme/store';
import { confirmAction } from '@/utils/dialog';
import { showError, showToast } from '@/utils/toast';

beforeEach(() => jest.clearAllMocks());

describe('exportBackup', () => {
  it('shares a backup built from the current state', async () => {
    await exportBackup();
    expect(buildBackup).toHaveBeenCalledWith({ marker: 'current' });
    expect(shareBackupFile).toHaveBeenCalledWith('backup-text');
    expect(showError).not.toHaveBeenCalled();
  });

  it('reports a share failure', async () => {
    jest.mocked(shareBackupFile).mockRejectedValue(new Error('no share sheet'));
    await exportBackup();
    expect(showError).toHaveBeenCalledWith(expect.any(String), 'no share sheet');
  });
});

describe('importBackup', () => {
  it('does nothing when the user cancels the picker', async () => {
    jest.mocked(pickBackupFile).mockResolvedValue(null);
    await importBackup();
    expect(planRestore).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('reports a picker failure', async () => {
    jest.mocked(pickBackupFile).mockRejectedValue(new Error('denied'));
    await importBackup();
    expect(showError).toHaveBeenCalledWith(expect.any(String), 'denied');
  });

  it('reports a file that is not a backup without asking to restore', async () => {
    jest.mocked(pickBackupFile).mockResolvedValue('junk');
    jest.mocked(planRestore).mockReturnValue({ error: 'format' } as never);
    await importBackup();
    expect(showError).toHaveBeenCalled();
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it('applies the snapshot only after the user confirms', async () => {
    jest.mocked(pickBackupFile).mockResolvedValue('{}');
    jest.mocked(planRestore).mockReturnValue({ snapshot: { marker: 'restored' } } as never);
    await importBackup();
    expect(applySnapshot).not.toHaveBeenCalled();
    jest.mocked(confirmAction).mock.calls[0][2]();
    expect(applySnapshot).toHaveBeenCalledWith({ marker: 'restored' });
    expect(showToast).toHaveBeenCalled();
  });
});

describe('importThemeFile', () => {
  it('installs the picked file under its file name', async () => {
    jest.mocked(pickThemeFile).mockResolvedValue({ name: 'dusk', css: 'css' });
    jest.mocked(installThemeFile).mockReturnValue(null);
    await importThemeFile();
    expect(installThemeFile).toHaveBeenCalledWith('css', 'dusk');
    expect(showToast).toHaveBeenCalled();
  });

  it('does nothing when the user cancels', async () => {
    jest.mocked(pickThemeFile).mockResolvedValue(null);
    await importThemeFile();
    expect(installThemeFile).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('refuses an oversized file without installing it', async () => {
    jest.mocked(pickThemeFile).mockResolvedValue('size');
    await importThemeFile();
    expect(installThemeFile).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalled();
  });

  it('reports a file the parser rejects', async () => {
    jest.mocked(pickThemeFile).mockResolvedValue({ name: 'x', css: 'junk' });
    jest.mocked(installThemeFile).mockReturnValue('header');
    await importThemeFile();
    expect(showError).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
