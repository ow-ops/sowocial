import { MutationCache, QueryClient } from '@tanstack/react-query';

import { t } from '@/i18n';
import { showError } from '@/utils/toast';

import { PERSIST_MAX_AGE } from './persist';

export function reportMutationError(error: Error, meta: Record<string, unknown> | undefined) {
  if (meta?.handlesError) return;
  showError(t('common.error'), error.message || t('common.unknownError'));
}

export function createQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => reportMutationError(error, mutation.meta),
    }),
    // gcTime must be at least the persist maxAge, or restored queries are collected right away.
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, gcTime: PERSIST_MAX_AGE } },
  });
}
