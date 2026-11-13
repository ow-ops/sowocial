import { getBackend } from '@/api/backend';
import { tid } from '@/api/bsky/tid';
import { createProcessor } from '@/api/outbox';
import { isAuthFailure } from '@/auth/auth-failure';
import { findSession } from '@/auth/session';
import { sessionHandle } from '@/components/source-badge';
import { t } from '@/i18n';
import { saveDraft } from '@/utils/drafts';
import { outboxStorage } from '@/utils/outbox-store';
import { showError } from '@/utils/toast';

export const outbox = createProcessor({
  ...outboxStorage,
  backendFor: getBackend,
  authFailed: (protocol, error) => isAuthFailure(protocol, error),
  hasAccount: (account) => !!findSession(account),
  saveDraft,
  gaveUp: ({ account }, error) => {
    const session = findSession(account);
    if (session) showError(t('compose.crossPost.gaveUp', { account: sessionHandle(session) }), error instanceof Error ? error.message : undefined);
  },
  newId: tid,
  now: Date.now,
});
