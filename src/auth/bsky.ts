import { asAtprotoProxy, Agent, AtpAgent } from '@atproto/api';
import type { OAuthSession } from '@atproto/oauth-client-expo';

import { accountKey } from './account-key';
import { describeBskyError } from './bsky-errors';
import { resolveIdentity, resolveServer } from './bsky-identity';
import { getBskyHooks } from './bsky-loader';
import { DEFAULT_SERVICES, resolveServices } from './bsky-services';
import type { BskySession } from './types';

export { moderatePost, moderateProfile } from '@atproto/api';
export { createBskyBackend } from '@/api/bsky/backend';

const appview = (session: BskySession) => asAtprotoProxy(resolveServices(session).appview);

const agents = new Map<string, Agent>();

const loadOAuth = () => import('./bsky-oauth');

function oauthAgent(session: BskySession, key: string) {
  let restored: ReturnType<(typeof import('./bsky-oauth'))['oauthRestore']> | undefined;
  const agent = new Agent({
    did: session.did,
    fetchHandler: async (pathname, init) => {
      const oauth = await loadOAuth();
      try {
        restored ??= oauth.oauthRestore(session.did);
        const response = await (await restored).fetchHandler(pathname, init);
        if (response.status === 401) getBskyHooks().authLost(key);
        return response;
      } catch (error) {
        if (oauth.isOAuthAuthError(error)) getBskyHooks().authLost(key);
        restored = undefined;
        throw error;
      }
    },
  });
  agent.configureProxy(appview(session));
  return agent;
}

function passwordAgent(session: BskySession, key: string) {
  const atp = new AtpAgent({
    service: session.pds,
    persistSession: (event, data) => {
      if (event === 'update' && data) getBskyHooks().tokensRefreshed(key, data);
      else if (event === 'expired' || event === 'create-failed') getBskyHooks().authLost(key);
    },
  });
  const resumed = session.appPassword ? atp.resumeSession(session.appPassword).catch(() => getBskyHooks().authLost(key)) : Promise.resolve();
  const agent = new Agent({
    did: session.did,
    fetchHandler: async (pathname, init) => {
      await resumed;
      return atp.sessionManager.fetchHandler(pathname, init);
    },
  });
  agent.configureProxy(appview(session));
  return agent;
}

export function getBskyAgent(session: BskySession): Agent {
  const key = accountKey(session);
  let agent = agents.get(key);
  if (!agent) {
    agent = session.auth === 'oauth' ? oauthAgent(session, key) : passwordAgent(session, key);
    agents.set(key, agent);
  }
  return agent;
}

export const dropBskyAgent = (session: BskySession) => void agents.delete(accountKey(session));

export async function signInWithAppPassword(identifier: string, password: string, server?: string): Promise<BskySession> {
  const handle = identifier.trim().replace(/^@/, '');
  const service = await resolveServer(handle, server);
  const atp = new AtpAgent({ service });
  const { data } = await atp
    .login({ identifier: handle, password: password.trim() })
    .catch((error: unknown) => Promise.reject(describeBskyError(error, { server: service })));
  return {
    protocol: 'bsky',
    did: data.did,
    handle: data.handle,
    pds: atp.pdsUrl?.origin ?? service,
    auth: 'app-password',
    accountId: data.did,
    acct: data.handle,
    appPassword: atp.session,
  };
}

async function sessionFromOAuth(oauth: OAuthSession): Promise<BskySession> {
  const agent = new Agent(oauth);
  agent.configureProxy(asAtprotoProxy(DEFAULT_SERVICES.appview));
  const [{ aud }, profile] = await Promise.all([
    oauth.getTokenInfo(false),
    agent.getProfile({ actor: oauth.did }).catch(() => null),
  ]);
  const handle = profile?.data.handle ?? (await resolveIdentity(oauth.did).catch(() => null))?.handle ?? oauth.did;
  return {
    protocol: 'bsky',
    did: oauth.did,
    handle,
    pds: new URL(aud).origin,
    auth: 'oauth',
    accountId: oauth.did,
    acct: handle,
  };
}

export async function signInWithOAuth(input: string): Promise<BskySession> {
  const handle = input.trim().replace(/^@/, '');
  const { oauthSignIn } = await loadOAuth();
  const oauth = await oauthSignIn(handle).catch((error: unknown) =>
    Promise.reject(describeBskyError(error, { server: handle, oauth: true })),
  );
  return sessionFromOAuth(oauth);
}

export async function completeOAuthSignIn(): Promise<BskySession | null> {
  const { oauthCallback } = await loadOAuth();
  const oauth = await oauthCallback().catch((error: unknown) =>
    Promise.reject(describeBskyError(error, { server: '', oauth: true })),
  );
  return oauth && sessionFromOAuth(oauth);
}

export async function signOutBsky(session: BskySession) {
  dropBskyAgent(session);
  if (session.auth === 'oauth') {
    const { oauthRestore } = await loadOAuth();
    await (await oauthRestore(session.did)).signOut();
  } else if (session.appPassword) {
    const atp = new AtpAgent({ service: session.pds });
    await atp.resumeSession(session.appPassword);
    await atp.logout();
  }
}
