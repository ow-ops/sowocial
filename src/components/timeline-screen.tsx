import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTimeline } from '@/api/timelines';
import { ComposeFab } from '@/components/compose-fab';
import { FeedBar } from '@/components/feed-bar';
import { LiveStatusList } from '@/components/status-list';
import { useColumn } from '@/hooks/use-column';

export function TimelineScreen({ timeline }: { timeline: 'home' | 'local' }) {
  const { t } = useTranslation();
  const { rail } = useColumn();
  return (
    <View style={{ flex: 1 }}>
      {rail && <FeedBar title={t(`timeline.tabs.${timeline}`)} />}
      <LiveStatusList
        timeline={timeline}
        underTabs
        query={useTimeline(timeline)}
        emptyText={t(`timeline.${timeline}.empty`)}
      />
      {!rail && <ComposeFab />}
    </View>
  );
}
