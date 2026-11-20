import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';

import { accountKey, useAccountScope, useAuthedSession } from '@/auth/session';
import { t } from '@/i18n';
import { toAuthor, toPost } from '@/model/adapters/ap';
import type { Author, Post } from '@/model/post';
import { applyReaction, type Reaction } from '@/model/reaction';

import { patchStatus } from '../cache';
import { accountOfPost, getMasto } from '../clients';
import { keys } from '../keys';
import { useServerFeatures, type ReactionApi } from './server';

// masto does not type these endpoints, but its client turns any property chain into a request:
// `.update()` is PUT, `.remove()` DELETE and `.fetch()` GET, and `$select(x)` adds a path segment.
type Verbs<T> = { update(): Promise<T>; remove(): Promise<T>; fetch(): Promise<unknown> };
type Selectable<T> = Verbs<T> & { $select(name: string): Verbs<T> };
type ReactionClient = {
  pleroma: { statuses: { $select(id: string): { reactions: Selectable<mastodon.v1.Status> } } };
  statuses: {
    $select(id: string): { emojiReactions: Selectable<mastodon.v1.Status>; emojiReactionedBy: Verbs<unknown> };
  };
};

const reactionClient = (masto: ReturnType<typeof getMasto>) => masto.v1 as unknown as ReactionClient;

export const useReactionApi = (): ReactionApi | undefined => useServerFeatures().data?.reactions;

type Reactors = { name: string; url?: string; accounts: Author[] };

type RawReaction = { name: string; url?: string; staticUrl?: string };
type PleromaReactors = (RawReaction & { accounts: mastodon.v1.Account[] })[];
type FedibirdReactors = (RawReaction & { account: mastodon.v1.Account })[];

function groupFedibird(raw: FedibirdReactors): Reactors[] {
  const groups = new Map<string, Reactors>();
  for (const { name, url, staticUrl, account } of raw) {
    const group = groups.get(name) ?? { name, url: url || staticUrl, accounts: [] };
    group.accounts.push(toAuthor(account));
    groups.set(name, group);
  }
  return [...groups.values()];
}

export function useReactors(id: string, enabled: boolean) {
  const account = useAccountScope();
  const api = useReactionApi();
  return useQuery({
    queryKey: [...keys.reactors(account, id), api],
    enabled: enabled && !!api,
    queryFn: async (): Promise<Reactors[]> => {
      const client = reactionClient(getMasto(account));
      if (api === 'fedibird') return groupFedibird((await client.statuses.$select(id).emojiReactionedBy.fetch()) as FedibirdReactors);
      const raw = (await client.pleroma.statuses.$select(id).reactions.fetch()) as PleromaReactors;
      return raw.map(({ name, url, staticUrl, accounts }) => ({ name, url: url || staticUrl, accounts: accounts.map(toAuthor) }));
    },
  });
}

type ReactVariables = { status: Post; name: string; url?: string; on: boolean };

export function useReact() {
  const activeKey = accountKey(useAuthedSession());
  const queryClient = useQueryClient();
  const api = useReactionApi();

  return useMutation({
    mutationFn: async ({ status, name, on }: ReactVariables): Promise<Reaction[] | undefined> => {
      if (!api) throw new Error(t('status.actions.unavailable'));
      const client = reactionClient(getMasto(accountOfPost(status, activeKey)));
      const verbs =
        api === 'fedibird'
          ? client.statuses.$select(status.id).emojiReactions.$select(name)
          : client.pleroma.statuses.$select(status.id).reactions.$select(name);
      const updated = await (on ? verbs.update() : verbs.remove());
      return toPost(updated).reactions;
    },
    onMutate: ({ status, name, url, on }) =>
      patchStatus(queryClient, status.accountKey ?? activeKey, status.id, (p) => ({ ...p, reactions: applyReaction(p.reactions, name, on, url) })),
    onError: (_error, { status, name, url, on }) =>
      patchStatus(queryClient, status.accountKey ?? activeKey, status.id, (p) =>
        !!p.reactions?.find((r) => r.name === name)?.me === on ? { ...p, reactions: applyReaction(p.reactions, name, !on, url) } : p,
      ),
    onSuccess: (reactions, { status }) => patchStatus(queryClient, status.accountKey ?? activeKey, status.id, (p) => ({ ...p, reactions })),
    onSettled: (_data, _error, { status }) =>
      queryClient.invalidateQueries({ queryKey: keys.reactors(status.accountKey ?? activeKey, status.id) }),
  });
}
