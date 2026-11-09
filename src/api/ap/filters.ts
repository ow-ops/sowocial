import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { mastodon } from 'masto';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { invalidateInfinite } from '../pagination';
import { handlesError } from '../mutation-meta';

type Filter = mastodon.v2.Filter;

export type FilterDraft = {
  id?: string;
  title: string;
  context: mastodon.v2.FilterContext[];
  filterAction: mastodon.v2.FilterAction;
  expiresIn?: number | null;
  keywords: { id?: string; keyword: string; wholeWord: boolean }[];
  removedKeywordIds: string[];
};

export function useFilters() {
  const { filters } = useCapabilities();
  return useQuery({ queryKey: keys.filters, queryFn: async () => await getMasto().v2.filters.list(), enabled: filters });
}

// Filtered statuses are decided server side, so cached timelines are stale after any change.
function useRefreshAfterChange() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: keys.filters });
    invalidateInfinite(queryClient, keys.timelines);
  };
}

export function useSaveFilter() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    meta: handlesError,
    mutationFn: (draft: FilterDraft): Promise<Filter> => {
      const { id, title, context, filterAction, expiresIn, keywords, removedKeywordIds } = draft;
      if (!id) {
        return getMasto().v2.filters.create({
          title,
          context,
          filterAction,
          expiresIn,
          keywordsAttributes: keywords.map(({ keyword, wholeWord }) => ({ keyword, wholeWord })),
        });
      }
      return getMasto().v2.filters.$select(id).update({
        title,
        context,
        filterAction,
        expiresIn,
        keywordsAttributes: [
          ...keywords.map(({ id: keywordId, keyword, wholeWord }) => ({ id: keywordId, keyword, wholeWord })),
          ...removedKeywordIds.map((keywordId) => ({ id: keywordId, _destroy: true })),
        ],
      });
    },
    onSuccess: refresh,
  });
}

export function useDeleteFilter() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    meta: handlesError,
    mutationFn: (id: string) => getMasto().v2.filters.$select(id).remove(),
    onSuccess: refresh,
  });
}
