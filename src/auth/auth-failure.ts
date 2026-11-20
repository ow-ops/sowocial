import type { QueryClient } from '@tanstack/react-query';
import { MastoHttpError } from 'masto';

import { accountOf, rootOf } from '@/api/keys';

import { accountKey } from './account-key';
import { find, markReconnect, sessionStore } from './session-store';
import type { Session } from './types';

const ATPROTO_TOKEN_ERRORS = new Set(['ExpiredToken', 'InvalidToken']);

export const isMastoAuthFailure = (error: unknown, queryKey?: readonly unknown[]) =>
  error instanceof MastoHttpError &&
  error.statusCode === 401 &&
  ((!!queryKey && rootOf(queryKey) === 'credentials') || /token/i.test(error.message));

// A 403 means the token was issued without the scopes the endpoint needs.
export const lacksScopes = (error: unknown) => error instanceof MastoHttpError && error.statusCode === 403;

export const isAtprotoAuthFailure = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  error.status === 401 &&
  'error' in error &&
  typeof error.error === 'string' &&
  ATPROTO_TOKEN_ERRORS.has(error.error);

export const isAuthFailure = (protocol: Session['protocol'], error: unknown, queryKey?: readonly unknown[]) =>
  protocol === 'bsky' ? isAtprotoAuthFailure(error) : isMastoAuthFailure(error, queryKey);

type CacheEvent = { type: string; query?: { queryKey: readonly unknown[] }; action?: { type: string; error?: unknown } };

function failedAccount(event: CacheEvent) {
  if (event.type !== 'updated' || event.action?.type !== 'error') return null;
  const queryKey = event.query?.queryKey;
  const scope = queryKey && accountOf(queryKey);
  const { sessions, active } = sessionStore.getState();
  const session = find(sessions, scope ?? active);
  return session && isAuthFailure(session.protocol, event.action.error, queryKey) ? accountKey(session) : null;
}

// Failed queries and mutations flag the account they belong to; Bluesky transport failures flag it from bsky.ts.
export function watchAuthFailures(queryClient: QueryClient) {
  const onCacheEvent = (event: CacheEvent) => {
    const key = failedAccount(event);
    if (key) markReconnect(key);
  };
  const unsubscribeQueries = queryClient.getQueryCache().subscribe(onCacheEvent);
  const unsubscribeMutations = queryClient.getMutationCache().subscribe(onCacheEvent);
  return () => {
    unsubscribeQueries();
    unsubscribeMutations();
  };
}
