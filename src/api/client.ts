import type { Agent } from '@atproto/api';
import { createRestAPIClient } from 'masto';
import { useMemo } from 'react';

import { getBskyAgent } from '@/auth/bsky-loader';
import { useApSession, useAuthedSession } from '@/auth/session';
import { t } from '@/i18n';

export type Masto = ReturnType<typeof createRestAPIClient>;

export function useMasto(): Masto | null {
  const session = useApSession();
  const instance = session?.instance;
  const token = session?.token;
  return useMemo(() => (instance === undefined ? null : createRestAPIClient({ url: instance, accessToken: token })), [instance, token]);
}

export function requireMasto(masto: Masto | null): Masto {
  if (!masto) throw new Error(t('status.actions.unavailable'));
  return masto;
}

export function useBsky(): Agent {
  const session = useAuthedSession();
  if (session.protocol !== 'bsky') throw new Error('The active account is not a Bluesky account');
  return getBskyAgent(session);
}

export type Client = { protocol: 'ap'; masto: Masto } | { protocol: 'bsky'; agent: Agent };
