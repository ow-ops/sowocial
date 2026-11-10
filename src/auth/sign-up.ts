import * as AuthSession from 'expo-auth-session';
import { createOAuthAPIClient, createRestAPIClient, MastoHttpError } from 'masto';

import i18n, { t } from '@/i18n';

import { discoverInstance } from './instance';
import { SCOPES } from './oauth';
import type { ApSession } from './types';

export type PendingAccount = { instance: string; token: string; clientId: string; clientSecret: string };

export type SignUpParams = {
  username: string;
  email: string;
  password: string;
  reason?: string;
  dateOfBirth?: string;
};

export async function loadSignUpInfo(input: string) {
  const instance = await discoverInstance(input);
  const { title, domain, rules, registrations, sourceUrl } = await createRestAPIClient({ url: instance }).v2.instance.fetch();
  return { instance, title, domain, rules, registrations, sourceUrl };
}

export async function createAccount(instance: string, params: SignUpParams): Promise<PendingAccount> {
  const redirectUri = AuthSession.makeRedirectUri({ path: 'oauth', scheme: 'sowocial' });
  const scope = SCOPES.join(' ');
  const app = await createRestAPIClient({ url: instance }).v1.apps.create({
    clientName: 'Sowocial',
    redirectUris: redirectUri,
    scopes: scope,
  });
  if (!app.clientId || !app.clientSecret) throw new Error(t('auth.errors.notRegistered'));

  const appToken = await createOAuthAPIClient({ url: instance }).token.create({
    grantType: 'client_credentials',
    clientId: app.clientId,
    clientSecret: app.clientSecret,
    redirectUri,
    scope,
  });
  const { accessToken } = await createRestAPIClient({ url: instance, accessToken: appToken.accessToken }).v1.accounts.create({
    ...params,
    agreement: true,
    locale: i18n.language,
  });
  return { instance, token: accessToken, clientId: app.clientId, clientSecret: app.clientSecret };
}

// Servers refuse the new account's token until the email is confirmed and, if required, a moderator approves it.
export async function activate(account: PendingAccount): Promise<ApSession | null> {
  try {
    const me = await createRestAPIClient({ url: account.instance, accessToken: account.token }).v1.accounts.verifyCredentials();
    return {
      protocol: 'ap',
      instance: account.instance,
      token: account.token,
      accountId: me.id,
      acct: me.acct,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
    };
  } catch (error) {
    if (error instanceof MastoHttpError && (error.statusCode === 401 || error.statusCode === 403)) return null;
    throw error;
  }
}

export const resendConfirmation = (account: PendingAccount) =>
  createRestAPIClient({ url: account.instance, accessToken: account.token }).v1.emails.confirmations.create({});
