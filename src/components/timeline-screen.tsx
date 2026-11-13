import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ComposeFab } from '@/components/compose-fab';
import { FeedBar } from '@/components/feed-bar';
import { HomeColumns, useColumnsEnabled } from '@/components/home-columns';
import { TimelinePosts } from '@/components/timeline-posts';
import { useColumn } from '@/hooks/use-column';

export function TimelineScreen({ timeline }: { timeline: 'home' | 'local' }) {
  const columns = useColumnsEnabled() && timeline === 'home';
  return columns ? <HomeColumns /> : <SingleTimeline timeline={timeline} />;
}

function SingleTimeline({ timeline }: { timeline: 'home' | 'local' }) {
  const { t } = useTranslation();
  const { rail } = useColumn();
  return (
    <View style={{ flex: 1 }}>
      {rail && <FeedBar title={t(`timeline.tabs.${timeline}`)} />}
      <TimelinePosts timeline={timeline} />
      {!rail && <ComposeFab />}
    </View>
  );
}
