import {
  atprotoLoopbackClientMetadata,
  ExpoOAuthClient,
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
  type OAuthClientMetadataInput,
  type OAuthSession,
} from '@atproto/oauth-client-expo';

import { oauthClientId, webClientMetadata } from './bsky-oauth-config';

type RedirectClient = ExpoOAuthClient & { signInRedirect(input: string): Promise<never> };

let client: RedirectClient | undefined;

function getClient() {
  if (client) return client;
  const clientId = oauthClientId('web', window.location);
  if (!clientId) throw new Error('Bluesky OAuth is not available on this origin');
  const clientMetadata = clientId.startsWith('http://localhost')
    ? atprotoLoopbackClientMetadata(clientId)
    : (webClientMetadata as OAuthClientMetadataInput);
  client = new ExpoOAuthClient({ handleResolver: 'https://bsky.social', clientMetadata }) as RedirectClient;
  return client;
}

export const oauthSignIn = (input: string): Promise<OAuthSession> => getClient().signInRedirect(input);

export const oauthCallback = (): Promise<OAuthSession | null> => getClient().handleCallback();

export const oauthRestore = (did: string): Promise<OAuthSession> => getClient().restore(did);

export const isOAuthAuthError = (error: unknown) =>
  error instanceof TokenRefreshError || error instanceof TokenRevokedError || error instanceof TokenInvalidError;
