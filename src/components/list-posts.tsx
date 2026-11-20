import { useTranslation } from 'react-i18next';

import { useCapabilities } from '@/api/backend';
import { listSource } from '@/api/timeline-source';
import { keys } from '@/api/keys';
import { useListTimeline } from '@/api/lists';
import { useAccountScope } from '@/auth/session';
import { StatusList } from '@/components/status-list';

export function ListPosts({ id }: { id: string }) {
  const { t } = useTranslation();
  const { paging } = useCapabilities();
  const account = useAccountScope();
  return (
    <StatusList
      query={useListTimeline(id)}
      queryKey={keys.listTimeline(account, id)}
      gapSource={listSource(account, id, paging === 'cursor')}
      emptyText={t('profile.lists.empty')}
    />
  );
}
