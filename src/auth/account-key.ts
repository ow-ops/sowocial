import type { Session } from './types';

// SecureStore keys allow only letters, digits and `.-_`; each account is stored under its own key.
export const accountKey = (s: Session) =>
  (s.protocol === 'bsky'
    ? `account.bsky.${s.did}`
    : `account.${s.instance.replace(/^https?:\/\//, '')}.${s.accountId}`
  ).replace(/[^\w.-]/g, '_');

export const LEGACY_KEY = 'session';
export const INDEX_KEY = 'accounts';
export const ACTIVE_KEY = 'active-account';
