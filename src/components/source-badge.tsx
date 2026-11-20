import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { accountKey } from '@/auth/account-key';
import { useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { useTheme } from '@/hooks/use-theme';
import type { Protocol } from '@/model/post';

const ICONS: Record<Protocol, SymbolViewProps['name']> = {
  ap: { ios: 'network', android: 'hub', web: 'hub' },
  bsky: { ios: 'cloud', android: 'cloud', web: 'cloud' },
};

const ACCENTS = { ap: 'fediverse', bsky: 'bluesky' } as const;

export const networkColor = (protocol: Protocol) => ACCENTS[protocol];

export const hasBothNetworks = (sessions: Session[]) =>
  sessions.some((s) => s.protocol === 'ap') && sessions.some((s) => s.protocol === 'bsky');

export const useBothNetworks = () => hasBothNetworks(useSession().sessions);

export function NetworkGlyph({ protocol, size = 13, color }: { protocol: Protocol; size?: number; color?: string }) {
  const theme = useTheme();
  return <SymbolView name={ICONS[protocol]} size={size} tintColor={color ?? theme[ACCENTS[protocol]]} />;
}

export const sessionHandle = (session: Session) =>
  session.protocol === 'bsky' ? `@${session.handle}` : `@${session.acct ?? session.accountId}@${new URL(session.instance).host}`;

export function accountSource(sessions: Session[], key: string | undefined, t: TFunction) {
  const session = sessions.find((s) => accountKey(s) === key);
  if (!session) return null;
  const handle = sessionHandle(session);
  const network = t(`auth.network.${session.protocol}`);
  return { key: accountKey(session), protocol: session.protocol, network, handle, label: t('auth.network.from', { network, handle }) };
}

export function useAccountSource(enabled: boolean, key?: string) {
  const { t } = useTranslation();
  const { session: active, sessions } = useSession();
  if (!enabled) return null;
  return accountSource(sessions, key ?? (active ? accountKey(active) : undefined), t);
}
