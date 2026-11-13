import { useTranslation } from 'react-i18next';

import { useTimeline } from '@/api/timelines';
import { LiveStatusList } from '@/components/status-list';

export function TimelinePosts({ timeline }: { timeline: 'home' | 'local' }) {
  const { t } = useTranslation();
  return (
    <LiveStatusList
      timeline={timeline}
      underTabs
      query={useTimeline(timeline)}
      emptyText={t(`timeline.${timeline}.empty`)}
    />
  );
}
