import { useQuery } from '@tanstack/react-query';

import { getBackend, useBackend, useCapabilities } from './backend';
import { keys } from './keys';
import { fetchLinkPreview } from './link-preview';

export function useSearch(q: string) {
  return useQuery({
    queryKey: keys.search(q),
    queryFn: () => getBackend().search(q),
    enabled: q.length > 0,
    staleTime: 60_000,
  });
}

export function useSuggestedFollows() {
  const { suggestedFollows } = useCapabilities();
  const backend = useBackend();
  return useQuery({
    queryKey: keys.suggestedFollows,
    queryFn: () => backend.suggestedFollows(),
    enabled: suggestedFollows,
    staleTime: 10 * 60_000,
  });
}

export function useLinkPreview(url: string | undefined) {
  return useQuery({
    queryKey: keys.linkPreview(url ?? ''),
    queryFn: ({ signal }) => fetchLinkPreview(url!, signal),
    enabled: url !== undefined,
    staleTime: Infinity,
  });
}

export function useResolveUrl() {
  const backend = useBackend();
  return async (url: string, timeoutMs?: number) => {
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(new Error('Timed out')), timeoutMs) : undefined;
    try {
      return await backend.resolveUrl(url, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };
}
