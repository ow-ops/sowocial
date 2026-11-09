import { getBskyBackend } from '@/auth/bsky-loader';
import { findSession, getActiveSession, useAuthedSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { t } from '@/i18n';
import type { Post } from '@/model/post';

import { createApBackend } from '../ap/backend';
import { isForeign, mastoFor } from '../clients';
import { capabilitiesFor } from './capabilities';
import type { Backend } from './types';

export type { Backend, BackendCapabilities } from './types';

export const backendFor = (session: Session): Backend =>
  session.protocol === 'bsky' ? getBskyBackend(session) : createApBackend(session, mastoFor(session));

export function getBackend(account?: string): Backend {
  const session = account ? findSession(account) : getActiveSession();
  if (!session) throw new Error(t('status.actions.unavailable'));
  return backendFor(session);
}

export const backendForPost = (post: Post, actingKey: string) =>
  getBackend(isForeign(post, actingKey) ? post.accountKey : actingKey);

export const useBackend = () => backendFor(useAuthedSession());

export const useCapabilities = () => capabilitiesFor(useAuthedSession().protocol);
