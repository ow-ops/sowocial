import * as AuthSession from 'expo-auth-session';
import { createOAuthAPIClient, createRestAPIClient } from 'masto';

import { t } from '@/i18n';

import { discoverInstance } from './instance';
import * as storage from './storage';
import type { ApSession } from './types';

export const SCOPES = ['read', 'write', 'push'];
const PENDING_KEY = 'pending-oauth';

type Client = {
  instance: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type PendingSignIn = Client & { state: string; codeVerifier?: string };

// Mastodon 4.3+ advertises PKCE in its OAuth metadata; GoToSocial currently doesn't.
async function supportsPkce(instance: string) {
  try {
    const res = await fetch(`${instance}/.well-known/oauth-authorization-server`);
    if (!res.ok) return false;
    const meta = (await res.json()) as { code_challenge_methods_supported?: string[] };
    return meta.code_challenge_methods_supported?.includes('S256') ?? false;
  } catch {
    return false;
  }
}

async function prepare(instanceInput: string, forceLogin = false) {
  const instance = await discoverInstance(instanceInput);
  const redirectUri = AuthSession.makeRedirectUri({ path: 'oauth', scheme: 'sowocial' });

  const [app, usePKCE] = await Promise.all([
    createRestAPIClient({ url: instance }).v1.apps.create({
      clientName: 'Sowocial',
      redirectUris: redirectUri,
      scopes: SCOPES.join(' '),
    }),
    supportsPkce(instance),
  ]);
  if (!app.clientId || !app.clientSecret) {
    throw new Error(t('auth.errors.notRegistered'));
  }

  const request = new AuthSession.AuthRequest({
    clientId: app.clientId,
    redirectUri,
    scopes: SCOPES,
    usePKCE,
    // Lets a second account sign in when the browser is still logged in as the first.
    extraParams: forceLogin ? { force_login: 'true' } : undefined,
  });
  const discovery = { authorizationEndpoint: `${instance}/oauth/authorize` };
  const client: Client = { instance, clientId: app.clientId, clientSecret: app.clientSecret, redirectUri };
  return { request, discovery, client };
}

async function exchange(client: Client, code: string, codeVerifier?: string): Promise<ApSession> {
  // masto's types omit code_verifier; it serializes extra keys to snake_case.
  const params = {
    grantType: 'authorization_code' as const,
    code,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    redirectUri: client.redirectUri,
    scope: SCOPES.join(' '),
    ...(codeVerifier ? { codeVerifier } : {}),
  };
  const token = await createOAuthAPIClient({ url: client.instance }).token.create(params);

  const me = await createRestAPIClient({
    url: client.instance,
    accessToken: token.accessToken,
  }).v1.accounts.verifyCredentials();

  return {
    protocol: 'ap',
    instance: client.instance,
    token: token.accessToken,
    accountId: me.id,
    acct: me.acct,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
  };
}

export async function signIn(instanceInput: string, forceLogin = false): Promise<ApSession | null> {
  const { request, discovery, client } = await prepare(instanceInput, forceLogin);
  const result = await request.promptAsync(discovery);
  if (result.type === 'error') {
    throw new Error(result.error?.message ?? t('auth.errors.notApproved'));
  }
  if (result.type !== 'success') return null;
  return exchange(client, result.params.code, request.codeVerifier);
}

// Web uses a full-page redirect: a popup loses `window.opener` when the server sends
// Cross-Origin-Opener-Policy, so the /oauth route finishes the flow.
export async function startRedirectSignIn(instanceInput: string, forceLogin = false): Promise<void> {
  const { request, discovery, client } = await prepare(instanceInput, forceLogin);
  const url = await request.makeAuthUrlAsync(discovery);
  const pending: PendingSignIn = { ...client, state: request.state, codeVerifier: request.codeVerifier };
  await storage.setItem(PENDING_KEY, JSON.stringify(pending));
  window.location.assign(url);
}

export async function completeRedirectSignIn(code: string, state: string): Promise<ApSession> {
  const raw = await storage.getItem(PENDING_KEY);
  await storage.removeItem(PENDING_KEY);
  if (!raw) throw new Error(t('auth.errors.linkExpired'));

  const pending = JSON.parse(raw) as PendingSignIn;
  if (pending.state !== state) {
    throw new Error(t('auth.errors.notVerified'));
  }
  return exchange(pending, code, pending.codeVerifier);
}

// Best effort: GoToSocial has no revocation endpoint, Mastodon does.
export async function revokeToken(session: ApSession) {
  if (!session.clientId || !session.clientSecret) return;
  await createOAuthAPIClient({ url: session.instance }).revoke({
    clientId: session.clientId,
    clientSecret: session.clientSecret,
    token: session.token,
  });
}
