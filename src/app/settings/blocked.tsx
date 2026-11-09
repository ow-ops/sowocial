import { useTranslation } from 'react-i18next';

import { useBlockedAccounts, useUndoAccountModeration } from '@/api/accounts';
import { AccountRow } from '@/components/account-row';
import { ActionButton } from '@/components/action-row';
import { InfiniteList } from '@/components/infinite-list';

export default function BlockedAccounts() {
  const { t } = useTranslation();
  const undo = useUndoAccountModeration('blocks');
  return (
    <InfiniteList
      title={t('settings.blocked.title')}
      query={useBlockedAccounts()}
      keyExtractor={(a) => a.id}
      renderItem={(a) => (
        <AccountRow
          account={a}
          trailing={
            <ActionButton
              label={t('settings.blocked.unblock')}
              accessibilityLabel={t('settings.blocked.unblockLabel', { acct: a.handle })}
              failedTitle={t('settings.blocked.unblockFailed')}
              run={(options) => undo.mutate(a.id, options)}
            />
          }
        />
      )}
      emptyText={t('settings.blocked.empty')}
    />
  );
}
