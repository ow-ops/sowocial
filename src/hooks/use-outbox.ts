import { useEffect } from 'react';

import { useAppActive } from '@/hooks/use-app-active';
import { outbox } from '@/utils/outbox';

export function useOutbox(enabled: boolean) {
  const active = useAppActive();
  useEffect(() => {
    if (enabled && active) outbox.kick();
  }, [enabled, active]);
}
