import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';
import { toAuthor } from '@/model/adapters/ap';
import type { Author } from '@/model/post';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';

export type Suggestion = { kind: 'account'; account: Author } | { kind: 'tag'; name: string };

export function useSuggestions(kind: Suggestion['kind'], q: string) {
  const { suggestions } = useCapabilities();
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.suggestions(scope, kind, q),
    queryFn: async ({ signal }): Promise<Suggestion[]> => {
      const type = kind === 'account' ? 'accounts' : 'hashtags';
      const result = await getMasto(scope).v2.search.list({ q, type, resolve: kind === 'account', limit: 5 }, { requestInit: { signal } });
      return kind === 'account'
        ? result.accounts.map((account) => ({ kind: 'account', account: toAuthor(account) }))
        : result.hashtags.map((t) => ({ kind: 'tag', name: t.name }));
    },
    enabled: suggestions && q.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
