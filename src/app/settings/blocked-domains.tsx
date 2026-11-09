import { useTranslation } from 'react-i18next';

import { useBlockedDomains, useUnblockDomain } from '@/api/accounts';
import { ActionRow } from '@/components/action-row';
import { InfiniteList } from '@/components/infinite-list';

export default function BlockedDomains() {
  const { t } = useTranslation();
  const unblock = useUnblockDomain();
  return (
    <InfiniteList
      title={t('settings.blockedDomains.title')}
      query={useBlockedDomains()}
      keyExtractor={(d) => d}
      renderItem={(domain) => (
        <ActionRow
          title={domain}
          label={t('settings.blockedDomains.unblock')}
          accessibilityLabel={t('settings.blockedDomains.unblockLabel', { domain })}
          failedTitle={t('settings.blockedDomains.unblockFailed')}
          run={(options) => unblock.mutate(domain, options)}
        />
      )}
      emptyText={t('settings.blockedDomains.empty')}
    />
  );
}
