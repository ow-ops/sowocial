import { MastoHttpError } from 'masto';

import { rootOf } from '@/api/keys';

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
