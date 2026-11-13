import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ModListKind } from '@/api/backend/types';
import { useModListSubscriptions } from '@/api/bsky/mod-lists';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';

const KEYS = { mute: 'muted', block: 'blocked' } as const;

function Subscriptions({ kind }: { kind: ModListKind }) {
  const { t } = useTranslation();
  const lists = useModListSubscriptions(kind);
  const key = KEYS[kind];
  return (
    <Section title={t(`settings.moderationLists.${key}`)}>
      <QueryState
        pending={lists.isPending}
        error={lists.error}
        emptyText={lists.data?.length === 0 ? t(`settings.moderationLists.${key}Empty`) : undefined}
      />
      {lists.data?.map((list) => (
        <Row
          key={list.id}
          title={list.title}
          detail={list.creator.handle}
          chevron
          onPress={() => router.push({ pathname: '/lists/[id]', params: { id: list.id } })}
        />
      ))}
    </Section>
  );
}

export default function ModerationListsRoute() {
  const { t } = useTranslation();
  return (
    <SettingsScreen title={t('settings.moderationLists.title')}>
      <Subscriptions kind="mute" />
      <Subscriptions kind="block" />
    </SettingsScreen>
  );
}
