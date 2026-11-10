import type { ParseKeys } from 'i18next';

import { t } from '@/i18n';
import { showError } from '@/utils/toast';

export const handlesError = { handlesError: true } as const;

export const toastFailure = (titleKey: ParseKeys, error: Error) =>
  showError(t(titleKey), error.message || t('common.unknownError'));

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { handlesError?: boolean };
  }
}
