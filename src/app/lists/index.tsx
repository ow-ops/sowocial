import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listId } from '@/api/bsky/lists';
import { starterPackName, useActorStarterPacks } from '@/api/bsky/starter-packs';
import { useCreateList, useLists } from '@/api/lists';
import { useCapabilities } from '@/api/backend';
import type { ListPurpose } from '@/api/backend/types';
import { useAuthedSession } from '@/auth/session';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { showError } from '@/utils/toast';

const KINDS = ['curate', 'mod'] as const;

function StarterPacksSection() {
  const { t } = useTranslation();
  const { accountId } = useAuthedSession();
  const { data: packs, isPending, error, refetch } = useActorStarterPacks(accountId);
  return (
    <Section title={t('profile.starterPacks.lists')}>
      <QueryState
        pending={isPending}
        error={error}
        onRetry={() => refetch()}
        emptyText={packs?.length === 0 ? t('profile.starterPacks.listsIntro') : undefined}
      />
      {packs?.map((pack) => (
        <Row
          key={pack.uri}
          title={starterPackName(pack)}
          chevron
          onPress={() => router.push({ pathname: '/starter-pack/[id]', params: { id: listId(pack.uri) } })}
        />
      ))}
      <Row title={t('profile.starterPacks.new')} chevron onPress={() => router.push('/starter-pack/create')} />
    </Section>
  );
}

export default function Lists() {
  const { t } = useTranslation();
  const { data: lists, isPending, error } = useLists();
  const { listSettings, listPurposes, starterPacks } = useCapabilities();
  const create = useCreateList();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<ListPurpose>('curate');

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed, ...(listPurposes && { purpose }), ...(listSettings && { repliesPolicy: 'list', exclusive: false }) },
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
            detail={list.exclusive ? t('profile.lists.exclusiveDetail') : list.purpose === 'mod' ? t('profile.lists.kind.mod.label') : undefined}
            chevron
            onPress={() => router.push({ pathname: '/lists/[id]', params: { id: list.id } })}
          />
        ))}
      </Section>

      {starterPacks && <StarterPacksSection />}

      {listPurposes && (
        <Section title={t('profile.lists.kindSection')}>
          {KINDS.map((kind) => (
            <Row
              key={kind}
              title={t(`profile.lists.kind.${kind}.label`)}
              detail={t(`profile.lists.kind.${kind}.detail`)}
              role="radio"
              selected={purpose === kind}
              onPress={() => setPurpose(kind)}
            />
          ))}
        </Section>
      )}

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
