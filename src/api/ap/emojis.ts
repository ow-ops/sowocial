import { useQuery } from '@tanstack/react-query';

import { useForeignAccount } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys, scoped } from '../keys';

export function useCustomEmojis() {
  const { customEmojis } = useCapabilities();
  const scope = useForeignAccount();
  return useQuery({
    queryKey: scoped(keys.customEmojis, scope),
    queryFn: async () => {
      const emojis = await getMasto(scope).v1.customEmojis.list();
      return emojis.filter((e) => e.visibleInPicker).sort((a, b) => a.shortcode.localeCompare(b.shortcode));
    },
    staleTime: 60 * 60 * 1000,
    enabled: customEmojis,
  });
}
