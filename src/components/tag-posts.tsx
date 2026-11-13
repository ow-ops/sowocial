import { useTranslation } from 'react-i18next';

import { useTimeline } from '@/api/timelines';
import { LiveStatusList } from '@/components/status-list';

export function TagPosts({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <LiveStatusList
      timeline={{ tag: name }}
      query={useTimeline({ tag: name })}
      emptyText={t('timeline.tag.empty', { name })}
    />
  );
}
