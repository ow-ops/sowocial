import { createRestAPIClient } from 'masto';

import { getBskyAgent } from '@/auth/bsky-loader';
import { accountKey, findSession, getActiveSession } from '@/auth/session';
import type { ApSession, BskySession } from '@/auth/types';
import { t } from '@/i18n';
import type { Post } from '@/model/post';

import type { Client } from './client';

type Masto = Extract<Client, { protocol: 'ap' }>['masto'];

const mastos = new Map<string, { instance: string; token: string; masto: Masto }>();

export function mastoFor(session: ApSession): Masto {
  const key = accountKey(session);
  const cached = mastos.get(key);
  if (cached && cached.instance === session.instance && cached.token === session.token) return cached.masto;
  const masto = createRestAPIClient({ url: session.instance, accessToken: session.token });
  mastos.set(key, { instance: session.instance, token: session.token, masto });
  return masto;
}

export function getMasto(account?: string): Masto {
  const session = account ? findSession(account) : getActiveSession();
  if (session?.protocol !== 'ap') throw new Error(t('status.actions.unavailable'));
  return mastoFor(session);
}

export function getBskySession(account?: string): BskySession {
  const session = account ? findSession(account) : getActiveSession();
  if (session?.protocol !== 'bsky') throw new Error(t('status.actions.unavailable'));
  return session;
}

export const getAgent = (account?: string) => getBskyAgent(getBskySession(account));

export function getClientFor(key: string): Client | null {
  const session = findSession(key);
  if (!session) return null;
  if (session.protocol === 'bsky') return { protocol: 'bsky', agent: getBskyAgent(session) };
  return { protocol: 'ap', masto: mastoFor(session) };
}

export const isForeign = (post: Post, active: string | null) => !!post.accountKey && post.accountKey !== active;

export function clientForAccount(account: string | undefined, active: Client, activeKey: string): Client {
  if (!account || account === activeKey) return active;
  const client = getClientFor(account);
  if (!client) throw new Error(t('status.actions.unavailable'));
  return client;
}

export const clientForPost = (post: Post, active: Client, activeKey: string): Client =>
  clientForAccount(isForeign(post, activeKey) ? post.accountKey : undefined, active, activeKey);

export const stampAccount = (posts: Post[], key: string): Post[] => posts.map((p) => ({ ...p, accountKey: key }));

export const mastoForPost = (post: Post, actingKey: string) =>
  getMasto(isForeign(post, actingKey) ? post.accountKey : actingKey);
