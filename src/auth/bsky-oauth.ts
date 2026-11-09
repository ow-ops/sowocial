import {
  ExpoOAuthClient,
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
  type OAuthClientMetadataInput,
  type OAuthSession,
} from '@atproto/oauth-client-expo';

import { nativeClientMetadata } from './bsky-oauth-config';

let client: ExpoOAuthClient | undefined;

const getClient = () =>
  (client ??= new ExpoOAuthClient({
    handleResolver: 'https://bsky.social',
    clientMetadata: nativeClientMetadata as OAuthClientMetadataInput,
  }));

export const oauthSignIn = (input: string): Promise<OAuthSession> => getClient().signIn(input);

export const oauthCallback = (): Promise<OAuthSession | null> => getClient().handleCallback();

export const oauthRestore = (did: string): Promise<OAuthSession> => getClient().restore(did);

export const isOAuthAuthError = (error: unknown) =>
  error instanceof TokenRefreshError || error instanceof TokenRevokedError || error instanceof TokenInvalidError;
