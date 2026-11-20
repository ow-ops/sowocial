import { createRestAPIClient } from 'masto';

import { getBskyAgent } from '@/auth/bsky-loader';
import { accountKey, findSession } from '@/auth/session';
import type { ApSession, BskySession } from '@/auth/types';
import { t } from '@/i18n';
import type { Post } from '@/model/post';

export type Masto = ReturnType<typeof createRestAPIClient>;

const mastos = new Map<string, { instance: string; token: string; masto: Masto }>();

export function mastoFor(session: ApSession): Masto {
  const key = accountKey(session);
  const cached = mastos.get(key);
  if (cached && cached.instance === session.instance && cached.token === session.token) return cached.masto;
  const masto = createRestAPIClient({ url: session.instance, accessToken: session.token });
  mastos.set(key, { instance: session.instance, token: session.token, masto });
  return masto;
}

export const forgetMasto = (key: string) => mastos.delete(key);

export function getMasto(account: string): Masto {
  const session = findSession(account);
  if (session?.protocol !== 'ap') throw new Error(t('status.actions.unavailable'));
  return mastoFor(session);
}

export function getBskySession(account: string): BskySession {
  const session = findSession(account);
  if (session?.protocol !== 'bsky') throw new Error(t('status.actions.unavailable'));
  return session;
}

export const getAgent = (account: string) => getBskyAgent(getBskySession(account));

export const isForeign = (post: Post, active: string | null) => !!post.accountKey && post.accountKey !== active;

// A foreign post is acted on through the account that owns it.
export const accountOfPost = (post: Post, actingKey: string) => post.accountKey || actingKey;

export const stampAccount = (posts: Post[], key: string): Post[] => posts.map((p) => ({ ...p, accountKey: key }));
