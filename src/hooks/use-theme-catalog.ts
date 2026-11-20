import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { keys } from '@/api/keys';
import { fetchCatalog, updateInstalled } from '@/theme/catalog';

import { useThemeState } from './use-theme';

export function useThemeCatalog(enabled = true) {
  return useQuery({ queryKey: keys.themeCatalog, queryFn: fetchCatalog, staleTime: 60 * 60_000, enabled });
}

// Mounted once at the root, so installed themes update without opening the catalog.
export function useCatalogThemeSync() {
  const { themes, tweaks } = useThemeState();
  const { data } = useThemeCatalog([...themes, ...tweaks].some((custom) => custom.source));
  useEffect(() => {
    if (data) updateInstalled(data);
  }, [data]);
}
