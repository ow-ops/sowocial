import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { useSessionProfile } from '@/api/accounts';
import type { PostDraft } from '@/api/backend/types';
import { getMasto } from '@/api/clients';
import { type CrossBlock, type CrossTarget, crossTarget, fitCrossPost, limitsFromServer } from '@/api/cross-post';
import { keys, scoped } from '@/api/keys';
import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { Avatar } from '@/components/avatar';
import { Row } from '@/components/settings';
import { useAccountSource } from '@/components/source-badge';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { outbox } from '@/utils/outbox';

type Candidate = { key: string; session: Session };

export type CrossAccount = Candidate & ({ status: 'loading' | 'failed' } | { status: 'ready'; target: CrossTarget });

// A fediverse target's limits come from its server, so they load per account, and only while the section is shown.
function useCrossAccounts(candidates: Candidate[], shown: boolean): CrossAccount[] {
  const instances = useQueries({
    queries: candidates.map(({ key, session }) => ({
      queryKey: scoped(keys.instance, key),
      queryFn: () => getMasto(key).v2.instance.fetch(),
      staleTime: Infinity,
      enabled: shown && limitsFromServer(session),
    })),
  });
  return candidates.map((candidate, i) => {
    const { data, isError } = instances[i];
    const target = crossTarget(candidate.session, data?.configuration.statuses);
    return target ? { ...candidate, status: 'ready', target } : { ...candidate, status: isError ? 'failed' : 'loading' };
  });
}

// The other signed-in accounts a post can also go to. `draft` is what the primary post carries; `allowed` is false
// where the section does not apply (replies, quotes, polls, threads, edits, scheduled posts).
export function useCrossPost(owner: string, allowed: boolean, draftOf: () => PostDraft) {
  const { sessions } = useSession();
  const candidates = sessions.map((session) => ({ key: accountKey(session), session })).filter((c) => c.key !== owner);
  const shown = allowed && candidates.length > 0;
  const draft = shown ? draftOf() : undefined;
  const enabled = draft?.visibility === 'public' || draft?.visibility === 'unlisted';
  const accounts = useCrossAccounts(candidates, shown);
  const [chosen, setChosen] = useState<string[]>([]);
  const selected = enabled ? chosen : [];

  const fits = accounts.flatMap((account) =>
    draft && account.status === 'ready' && selected.includes(account.key)
      ? [{ key: account.key, fit: fitCrossPost(draft, account.target) }]
      : [],
  );
  const blocks = Object.fromEntries(
    fits.flatMap((c) => ('blocked' in c.fit ? [[c.key, c.fit.blocked] as const] : [])),
  ) as Partial<Record<string, CrossBlock>>;

  return {
    shown,
    blocked: fits.some((c) => 'blocked' in c.fit),
    props: { accounts, selected, onChange: setChosen, enabled, blocked: blocks },
    send: () => {
      outbox.enqueue(fits.flatMap((c) => ('draft' in c.fit ? [{ account: c.key, draft: c.fit.draft }] : [])));
      outbox.kick();
    },
  };
}

function CrossAccountRow({
  account,
  selected,
  enabled,
  blocked,
  onToggle,
}: {
  account: CrossAccount;
  selected: boolean;
  enabled: boolean;
  blocked?: CrossBlock;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const source = useAccountSource(true, account.key);
  const profile = useSessionProfile(account.session, false);
  if (!source) return null;

  const usable = enabled && account.status === 'ready';
  const detail = blocked
    ? t(`compose.crossPost.blocked.${blocked}`)
    : account.status === 'ready'
      ? source.network
      : t(account.status === 'failed' ? 'compose.crossPost.limitsFailed' : 'compose.crossPost.loading');
  return (
    <Row
      leading={profile.data ? <Avatar uri={profile.data.avatar} /> : undefined}
      title={source.handle}
      detail={detail}
      role="switch"
      selected={selected}
      onPress={usable ? onToggle : undefined}
      trailing={
        <Switch
          value={selected}
          disabled={!usable}
          onValueChange={onToggle}
          trackColor={{ true: theme.primary }}
          accessibilityLabel={source.handle}
        />
      }
    />
  );
}

export function ComposeCross({
  accounts,
  selected,
  onChange,
  enabled,
  blocked,
}: {
  accounts: CrossAccount[];
  selected: string[];
  onChange: (keys: string[]) => void;
  enabled: boolean;
  blocked: Partial<Record<string, CrossBlock>>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const toggle = (key: string) => onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      <ThemedText type="meta" accessibilityRole="header">
        {t('compose.crossPost.title')}
      </ThemedText>
      {accounts.map((account) => (
        <CrossAccountRow
          key={account.key}
          account={account}
          selected={selected.includes(account.key)}
          enabled={enabled}
          blocked={blocked[account.key]}
          onToggle={() => toggle(account.key)}
        />
      ))}
      {!enabled && (
        <ThemedText type="meta" themeColor="muted">
          {t('compose.crossPost.visibility')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderTopWidth: Hairline,
  },
});
