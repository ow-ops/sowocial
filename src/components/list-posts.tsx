import { useTranslation } from 'react-i18next';

import { useCapabilities } from '@/api/backend';
import { listSource } from '@/api/catch-up';
import { keys } from '@/api/keys';
import { useListTimeline } from '@/api/lists';
import { StatusList } from '@/components/status-list';

export function ListPosts({ id }: { id: string }) {
  const { t } = useTranslation();
  const { paging } = useCapabilities();
  return (
    <StatusList
      query={useListTimeline(id)}
      queryKey={keys.listTimeline(id)}
      gapSource={listSource(id, paging === 'cursor')}
      emptyText={t('profile.lists.empty')}
    />
  );
}
