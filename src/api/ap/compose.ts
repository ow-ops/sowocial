import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useForeignAccount } from '@/auth/session';
import { toAuthor } from '@/model/adapters/ap';
import type { Author, PostingDefaults, Visibility } from '@/model/post';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys, scoped } from '../keys';
import { handlesError } from '../mutation-meta';

export type Audience = 'everyone' | 'followers' | 'mentioned';

export type InteractionAudiences = { reply: Audience; reblog: Audience; favourite: Audience };

export const OPEN_AUDIENCES: InteractionAudiences = { reply: 'everyone', reblog: 'everyone', favourite: 'everyone' };

export type GtsPostParams = {
  localOnly?: boolean;
  contentType?: 'text/plain' | 'text/markdown';
  interactionPolicy?: Partial<Record<'canReply' | 'canReblog' | 'canFavourite', { automaticApproval: string[] }>>;
  scheduledAt?: string;
};

const APPROVAL: Record<Audience, string[]> = {
  everyone: ['public'],
  followers: ['author', 'followers'],
  mentioned: ['author', 'mentioned'],
};

export function toInteractionPolicy({ reply, reblog, favourite }: InteractionAudiences): GtsPostParams['interactionPolicy'] {
  const policy: NonNullable<GtsPostParams['interactionPolicy']> = {};
  if (reply !== 'everyone') policy.canReply = { automaticApproval: APPROVAL[reply] };
  if (reblog !== 'everyone') policy.canReblog = { automaticApproval: APPROVAL[reblog] };
  if (favourite !== 'everyone') policy.canFavourite = { automaticApproval: APPROVAL[favourite] };
  return Object.keys(policy).length ? policy : undefined;
}

export function deviceLanguage() {
  return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0];
}

const RESTRICTIVENESS: Visibility[] = ['public', 'unlisted', 'private', 'direct'];

const narrower = (a: Visibility, b: Visibility) => (RESTRICTIVENESS.indexOf(a) >= RESTRICTIVENESS.indexOf(b) ? a : b);

export function resolveVisibility({
  editing,
  parent,
  prefill,
  saved,
  defaults,
}: {
  editing?: Visibility;
  parent?: Visibility;
  prefill?: Visibility;
  saved?: Visibility;
  defaults?: PostingDefaults;
}): Visibility {
  if (editing) return editing;
  if (parent) return defaults?.visibility ? narrower(parent, defaults.visibility) : parent;
  return prefill ?? saved ?? defaults?.visibility ?? 'public';
}

export const resolveLanguage = (saved?: string, defaults?: PostingDefaults) => saved ?? defaults?.language ?? deviceLanguage();


export function useScheduledStatuses() {
  const { scheduled } = useCapabilities();
  return useInfiniteQuery({
    queryKey: keys.scheduled,
    queryFn: async ({ pageParam }) => await getMasto().v1.scheduledStatuses.list({ limit: 20, maxId: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === 20 ? last.at(-1)?.id : undefined),
    enabled: scheduled,
  });
}

export function useInvalidateScheduled() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.scheduled });
}

export function useCancelScheduled() {
  const invalidate = useInvalidateScheduled();
  return useMutation({
    meta: handlesError,
    mutationFn: (id: string) => getMasto().v1.scheduledStatuses.$select(id).remove(),
    onSuccess: invalidate,
  });
}

export function useRescheduleStatus() {
  const invalidate = useInvalidateScheduled();
  return useMutation({
    meta: handlesError,
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      getMasto().v1.scheduledStatuses.$select(id).update({ scheduledAt }),
    onSuccess: invalidate,
  });
}

export type Suggestion = { kind: 'account'; account: Author } | { kind: 'tag'; name: string };

export function useSuggestions(kind: Suggestion['kind'], q: string) {
  const { suggestions } = useCapabilities();
  const scope = useForeignAccount();
  return useQuery({
    queryKey: scoped(keys.suggestions(kind, q), scope),
    queryFn: async ({ signal }): Promise<Suggestion[]> => {
      const type = kind === 'account' ? 'accounts' : 'hashtags';
      const result = await getMasto().v2.search.list({ q, type, resolve: kind === 'account', limit: 5 }, { requestInit: { signal } });
      return kind === 'account'
        ? result.accounts.map((account) => ({ kind: 'account', account: toAuthor(account) }))
        : result.hashtags.map((t) => ({ kind: 'tag', name: t.name }));
    },
    enabled: suggestions && q.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
