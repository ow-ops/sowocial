import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateList, useLists } from '@/api/lists';
import { useCapabilities } from '@/api/backend';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { showError } from '@/utils/toast';

export default function Lists() {
  const { t } = useTranslation();
  const { data: lists, isPending, error } = useLists();
  const { listSettings } = useCapabilities();
  const create = useCreateList();
  const [title, setTitle] = useState('');

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed, ...(listSettings && { repliesPolicy: 'list', exclusive: false }) },
      {
        onSuccess: (list) => {
          setTitle('');
          router.push({ pathname: '/lists/manage/[id]', params: { id: list.id } });
        },
        onError: (e) => showError(t('profile.lists.createFailed'), e.message),
      },
    );
  };

  return (
    <SettingsScreen title={t('common.nav.lists')}>
      <Section title={t('profile.lists.yours')}>
        <QueryState pending={isPending} error={error} emptyText={lists?.length === 0 ? t('profile.lists.intro') : undefined} />
        {lists?.map((list) => (
          <Row
            key={list.id}
            title={list.title}
            detail={list.exclusive ? t('profile.lists.exclusiveDetail') : undefined}
            chevron
            onPress={() => router.push({ pathname: '/lists/[id]', params: { id: list.id } })}
          />
        ))}
      </Section>

      <Section title={t('profile.lists.newList')}>
        <TextField
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
          placeholder={t('profile.lists.name')}
          returnKeyType="done"
          accessibilityLabel={t('profile.lists.name')}
        />
        <Button label={t('profile.lists.create')} loading={create.isPending} disabled={!title.trim()} onPress={submit} />
      </Section>
    </SettingsScreen>
  );
}
