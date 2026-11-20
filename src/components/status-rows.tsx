import { createContext, use, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { accountKey } from '@/auth/account-key';
import { useAuthedSession, useSession } from '@/auth/session';
import { accountSource, hasBothNetworks } from '@/components/source-badge';
import { useColumn } from '@/hooks/use-column';
import { useDensity } from '@/prefs/store';

// Values every row of a list shares, read once by the list instead of by each row.
function useRowEnv() {
  const { t } = useTranslation();
  const { session: active, sessions } = useSession();
  const { accountId } = useAuthedSession();
  const density = useDensity();
  const { wide, card } = useColumn();
  const activeKey = active ? accountKey(active) : undefined;

  return {
    accountId,
    density,
    wide,
    card,
    bothNetworks: hasBothNetworks(sessions),
    sourceOf: (key = activeKey) => accountSource(sessions, key, t),
  };
}

const RowEnvContext = createContext<ReturnType<typeof useRowEnv> | null>(null);

export function StatusRows({ children }: { children: ReactNode }) {
  return <RowEnvContext value={useRowEnv()}>{children}</RowEnvContext>;
}

export const useInStatusRows = () => use(RowEnvContext) !== null;

export function useStatusRow() {
  const env = use(RowEnvContext);
  if (!env) throw new Error('useStatusRow must be used inside StatusRows');
  return env;
}
