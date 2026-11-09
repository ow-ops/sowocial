import type { AtpSessionData } from '@atproto/api';

import type { BskyServices } from './bsky-services';

export type ApSession = {
  protocol: 'ap';
  instance: string;
  token: string;
  accountId: string;
  acct?: string;
  // Absent for sessions saved before revocation support.
  clientId?: string;
  clientSecret?: string;
};

export type BskySession = {
  protocol: 'bsky';
  did: string;
  handle: string;
  pds: string;
  auth: 'oauth' | 'app-password';
  // The DID again, so code shared with the fediverse sessions can read accountId and acct.
  accountId: string;
  acct: string;
  // Tokens of an app-password session; OAuth tokens live in the oauth client's own store.
  appPassword?: AtpSessionData;
  // Custom AppView, chat and moderation services; absent entries use Bluesky's.
  services?: BskyServices;
};

export type Session = ApSession | BskySession;
