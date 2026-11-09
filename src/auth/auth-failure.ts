import { MastoHttpError } from 'masto';

import { keys } from '@/api/keys';

import type { Session } from './types';

const ATPROTO_TOKEN_ERRORS = new Set(['ExpiredToken', 'InvalidToken']);

export const isMastoAuthFailure = (error: unknown, queryKey?: readonly unknown[]) =>
  error instanceof MastoHttpError &&
  error.statusCode === 401 &&
  (queryKey?.[0] === keys.credentials[0] || /token/i.test(error.message));

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
