import { useQuery } from '@tanstack/react-query';

import { useAccountScope } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';

export function useCustomEmojis() {
  const { customEmojis } = useCapabilities();
  const scope = useAccountScope();
  return useQuery({
    queryKey: keys.customEmojis(scope),
    queryFn: async () => {
      const emojis = await getMasto(scope).v1.customEmojis.list();
      return emojis.filter((e) => e.visibleInPicker).sort((a, b) => a.shortcode.localeCompare(b.shortcode));
    },
    staleTime: 60 * 60 * 1000,
    enabled: customEmojis,
  });
}
