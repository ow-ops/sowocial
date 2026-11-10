import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useListMembers, useListMembership, useLists } from '@/api/lists';
import { useCapabilities } from '@/api/backend';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { showError } from '@/utils/toast';

export default function AddToList() {
  const { t } = useTranslation();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { listSettings } = useCapabilities();
  const { data: lists, isPending, error } = useLists();

  return (
    <SettingsScreen title={t('common.nav.addToList')}>
      <Section title={t('profile.lists.addTitle')}>
        <ThemedText type="meta">{t(listSettings ? 'profile.lists.addIntro' : 'profile.lists.addAnyoneToIntro')}</ThemedText>
        <QueryState pending={isPending} error={error} emptyText={lists?.length === 0 ? t('profile.lists.none') : undefined} />
        {lists?.map((list) => <ListRow key={list.id} listId={list.id} title={list.title} accountId={accountId} />)}
      </Section>
    </SettingsScreen>
  );
}

function ListRow({ listId, title, accountId }: { listId: string; title: string; accountId: string }) {
  const { t } = useTranslation();
  const { data: members } = useListMembers(listId);
  const membership = useListMembership(listId);
  const member = members?.some((m) => m.id === accountId) ?? false;

  return (
    <Row
      title={title}
      trailing={
        <Button
          label={member ? t('common.remove') : t('common.add')}
          accessibilityLabel={member ? t('profile.lists.removeFromA11y', { title }) : t('profile.lists.addToA11y', { title })}
          size="small"
          variant="outline"
          disabled={!members}
          loading={membership.isPending}
          onPress={() =>
            membership.mutate(
              { accountId, member: !member },
              { onError: (e) => showError(t('profile.lists.updateFailed'), e.message) },
            )
          }
        />
      }
    />
  );
}
