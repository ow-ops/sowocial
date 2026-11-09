import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { keys, type SavedKind } from '@/api/keys';
import { useSavedStatuses } from '@/api/timelines';
import { StatusList } from '@/components/status-list';

export default function SavedStatuses() {
  const { t } = useTranslation();
  const { kind } = useLocalSearchParams<{ kind: SavedKind }>();
  const savedKind: SavedKind = kind === 'favourites' ? 'favourites' : 'bookmarks';
  return (
    <StatusList
      title={t(`timeline.saved.${savedKind}.title`)}
      query={useSavedStatuses(savedKind)}
      queryKey={keys.saved(savedKind)}
      emptyText={t(`timeline.saved.${savedKind}.empty`)}
    />
  );
}
