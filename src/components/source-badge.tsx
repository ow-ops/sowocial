import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { accountKey } from '@/auth/account-key';
import { useSession } from '@/auth/session';
import { useTheme } from '@/hooks/use-theme';
import type { Protocol } from '@/model/post';

const ICONS: Record<Protocol, SymbolViewProps['name']> = {
  ap: { ios: 'network', android: 'hub', web: 'hub' },
  bsky: { ios: 'cloud', android: 'cloud', web: 'cloud' },
};

const ACCENTS = { ap: 'fediverse', bsky: 'bluesky' } as const;

export const networkColor = (protocol: Protocol) => ACCENTS[protocol];

export function useBothNetworks() {
  const { sessions } = useSession();
  return sessions.some((s) => s.protocol === 'ap') && sessions.some((s) => s.protocol === 'bsky');
}

export function NetworkGlyph({ protocol, size = 13 }: { protocol: Protocol; size?: number }) {
  const theme = useTheme();
  return <SymbolView name={ICONS[protocol]} size={size} tintColor={theme[ACCENTS[protocol]]} />;
}

export function useAccountSource(enabled: boolean, key?: string) {
  const { t } = useTranslation();
  const { session: active, sessions } = useSession();
  if (!enabled) return null;
  const wanted = key ?? (active ? accountKey(active) : undefined);
  const session = wanted ? sessions.find((s) => accountKey(s) === wanted) : undefined;
  if (!session) return null;
  const handle = session.protocol === 'bsky' ? `@${session.handle}` : `@${session.acct ?? session.accountId}@${new URL(session.instance).host}`;
  const network = t(`auth.network.${session.protocol}`);
  return { protocol: session.protocol, network, handle, label: t('auth.network.from', { network, handle }) };
}
