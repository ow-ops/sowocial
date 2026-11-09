import { useTranslation } from 'react-i18next';

import { useTimeline } from '@/api/timelines';
import { LiveStatusList } from '@/components/status-list';

export default function Federated() {
  const { t } = useTranslation();
  return (
    <LiveStatusList
      timeline="public"
      title={t('common.nav.federated')}
      query={useTimeline('public')}
      emptyText={t('timeline.federated.empty')}
    />
  );
}
