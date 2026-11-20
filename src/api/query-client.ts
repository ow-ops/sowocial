import { MutationCache, QueryClient } from '@tanstack/react-query';

import { t } from '@/i18n';
import { showError } from '@/utils/toast';

import { PERSIST_MAX_AGE, PERSISTED_ROOTS } from './persist';

function reportMutationError(error: Error, meta: Record<string, unknown> | undefined) {
  if (meta?.handlesError) return;
  showError(t('common.error'), error.message || t('common.unknownError'));
}

export function createQueryClient() {
  const client = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => reportMutationError(error, mutation.meta),
    }),
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  // A persisted query's gcTime must be at least the persist maxAge, or it is collected before it can be saved or restored.
  // The {} matches the account object every account-scoped key starts with.
  for (const root of PERSISTED_ROOTS) client.setQueryDefaults([{}, root], { gcTime: PERSIST_MAX_AGE });
  return client;
}
