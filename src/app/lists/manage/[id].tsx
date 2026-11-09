import { router, useLocalSearchParams } from 'expo-router';
import type { mastodon } from 'masto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';

import {
  useDeleteList,
  useFollowedAccountSearch,
  useList,
  useListMembers,
  useListMembership,
  useUpdateList,
} from '@/api/ap/lists';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Author } from '@/model/post';
import { confirmAction } from '@/utils/dialog';
import { showError } from '@/utils/toast';

const POLICIES: mastodon.v1.ListRepliesPolicy[] = ['list', 'followed', 'none'];

export default function ManageListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { t } = useTranslation();
  const { data: list } = useList(id);
  if (list) return <ManageList list={list} />;
  return (
    <SettingsScreen title={t('common.nav.manageList')}>
      <ActivityIndicator color={theme.muted} />
    </SettingsScreen>
  );
}

function ManageList({ list }: { list: mastodon.v1.List }) {
  const { t } = useTranslation();
  const { id } = list;
  const theme = useTheme();
  const update = useUpdateList(id);
  const remove = useDeleteList();
  const [title, setTitle] = useState(list.title);

  const save = (changes: Partial<mastodon.v1.List>) =>
    update.mutate(
      { title: list.title, repliesPolicy: list.repliesPolicy, exclusive: list.exclusive, ...changes },
      { onError: (e) => showError(t('profile.lists.updateFailed'), e.message) },
    );
  const rename = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== list.title) save({ title: trimmed });
  };

  return (
    <SettingsScreen title={t('common.nav.manageList')}>
      <Section title={t('profile.lists.nameSection')}>
        <TextField
          value={title}
          onChangeText={setTitle}
          onBlur={rename}
          onSubmitEditing={rename}
          returnKeyType="done"
          accessibilityLabel={t('profile.lists.name')}
        />
      </Section>

      <Section title={t('profile.lists.repliesSection')}>
        {POLICIES.map((p) => (
          <Row
            key={p}
            title={t(`profile.lists.policy.${p}.label`)}
            detail={t(`profile.lists.policy.${p}.detail`)}
            role="radio"
            selected={list.repliesPolicy === p}
            onPress={() => save({ repliesPolicy: p })}
          />
        ))}
      </Section>

      <Section title={t('profile.lists.homeTimeline')}>
        <Row
          title={t('profile.lists.exclusive')}
          detail={t('profile.lists.exclusiveSwitchDetail')}
          trailing={
            <Switch
              value={list.exclusive}
              onValueChange={(exclusive) => save({ exclusive })}
              trackColor={{ true: theme.primary }}
              accessibilityLabel={t('profile.lists.exclusiveA11y')}
            />
          }
        />
      </Section>

      <Members listId={id} />

      <Button
        label={t('profile.lists.delete')}
        variant="outline"
        loading={remove.isPending}
        onPress={() =>
          confirmAction(t('profile.lists.deleteConfirm', { title: list.title }), t('common.delete'), () =>
            remove.mutate(id, {
              onSuccess: () => router.dismissTo('/lists'),
              onError: (e) => showError(t('profile.lists.deleteFailed'), e.message),
            }),
          )
        }
      />
    </SettingsScreen>
  );
}

function Members({ listId }: { listId: string }) {
  const { t } = useTranslation();
  const { data: members, isPending, error } = useListMembers(listId);
  const membership = useListMembership(listId);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const search = useFollowedAccountSearch(query);
  const memberIds = new Set(members?.map((m) => m.id));
  const toggle = (accountId: string, member: boolean) =>
    membership.mutate({ accountId, member }, { onError: (e) => showError(t('profile.lists.updateFailed'), e.message) });

  return (
    <>
      <Section title={t('profile.lists.members')}>
        <QueryState pending={isPending} error={error} emptyText={members?.length === 0 ? t('profile.lists.noMembers') : undefined} />
        {members?.map((a) => (
          <AccountToggleRow key={a.id} account={a} member onToggle={() => toggle(a.id, false)} />
        ))}
      </Section>

      <Section title={t('profile.lists.addPeople')}>
        <ThemedText type="meta">{t('profile.lists.addPeopleIntro')}</ThemedText>
        <TextField
          value={input}
          onChangeText={(text) => {
            setInput(text);
            if (!text.trim()) setQuery('');
          }}
          onSubmitEditing={() => setQuery(input.trim())}
          placeholder={t('profile.lists.searchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={t('profile.lists.searchPlaceholder')}
        />
        <QueryState
          pending={search.isFetching}
          error={search.error}
          emptyText={search.data?.length === 0 ? t('profile.lists.noMatch') : undefined}
        />
        {search.data?.map((a) => (
          <AccountToggleRow
            key={a.id}
            account={a}
            member={memberIds.has(a.id)}
            onToggle={() => toggle(a.id, !memberIds.has(a.id))}
          />
        ))}
      </Section>
    </>
  );
}

function AccountToggleRow({
  account,
  member,
  onToggle,
}: {
  account: Author;
  member: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Row
      title={account.displayName}
      detail={`@${account.handle}`}
      leading={<Avatar uri={account.avatar} />}
      trailing={
        <View style={styles.action}>
          <Button
            label={member ? t('common.remove') : t('common.add')}
            accessibilityLabel={member ? t('profile.lists.removeA11y', { acct: account.handle }) : t('profile.lists.addA11y', { acct: account.handle })}
            size="small"
            variant="outline"
            onPress={onToggle}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  action: { marginLeft: Spacing.two },
});
