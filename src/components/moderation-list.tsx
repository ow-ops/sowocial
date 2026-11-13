import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useModList, useModListMembers, useSetModListSubscription } from '@/api/bsky/mod-lists';
import { AccountRow } from '@/components/account-row';
import { InfiniteList } from '@/components/infinite-list';
import { QueryState } from '@/components/query-state';
import { Row, Section } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ModListKind } from '@/api/backend/types';

function SubscriptionRow({ id, kind, on, title, detail }: { id: string; kind: ModListKind; on: boolean; title: string; detail: string }) {
  const theme = useTheme();
  const subscribe = useSetModListSubscription(id, kind);
  return (
    <Row
      title={title}
      detail={detail}
      trailing={
        <Switch
          value={on}
          disabled={subscribe.isPending}
          onValueChange={(value) => subscribe.mutate(value)}
          trackColor={{ true: theme.primary }}
          accessibilityLabel={title}
        />
      }
    />
  );
}

export function ModerationList({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: list, error, refetch } = useModList(id);
  const members = useModListMembers(id);

  const header = (
    <View style={[styles.header, { backgroundColor: theme.page }]}>
      <QueryState pending={false} error={error} onRetry={() => void refetch()} />
      {list && (
        <View style={styles.about}>
          {list.description ? <ThemedText>{list.description}</ThemedText> : null}
          <Pressable
            accessibilityRole="link"
            hitSlop={Spacing.two}
            onPress={() => router.push({ pathname: '/account/[id]', params: { id: list.creator.id } })}>
            <ThemedText type="meta">{t('profile.lists.createdBy', { handle: list.creator.handle })}</ThemedText>
          </Pressable>
        </View>
      )}
      <Section title={t('profile.lists.modSection')}>
        <SubscriptionRow
          id={id}
          kind="mute"
          on={!!list?.subscription.muted}
          title={t('profile.lists.mute')}
          detail={t('profile.lists.muteDetail')}
        />
        <SubscriptionRow
          id={id}
          kind="block"
          on={!!list?.subscription.blocked}
          title={t('profile.lists.block')}
          detail={t('profile.lists.blockDetail')}
        />
      </Section>
      <Section title={t('profile.lists.members')}>{null}</Section>
    </View>
  );

  return (
    <InfiniteList
      title={list?.title ?? t('profile.lists.title')}
      query={members}
      keyExtractor={(a) => a.id}
      renderItem={(a) => <AccountRow account={a} />}
      emptyText={t('profile.lists.noMembers')}
      header={header}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  about: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
});
