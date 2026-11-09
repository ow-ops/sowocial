import type { Agent, AtpSessionData } from '@atproto/api';

import type { BskySession } from './types';

export type BskyHooks = {
  authLost: (key: string) => void;
  tokensRefreshed: (key: string, tokens: AtpSessionData) => void;
};

let hooks: BskyHooks = { authLost: () => {}, tokensRefreshed: () => {} };

export const setBskyHooks = (next: BskyHooks) => {
  hooks = next;
};

export const getBskyHooks = () => hooks;

let loaded: typeof import('./bsky') | undefined;

export async function loadBsky() {
  loaded ??= await import('./bsky');
  return loaded;
}

export const getBskyModeration = () =>
  loaded && { moderatePost: loaded.moderatePost, moderateProfile: loaded.moderateProfile };

export function getBskyAgent(session: BskySession): Agent {
  if (!loaded) throw new Error('Bluesky support has not been loaded');
  return loaded.getBskyAgent(session);
}

export function getBskyBackend(session: BskySession) {
  if (!loaded) throw new Error('Bluesky support has not been loaded');
  return loaded.createBskyBackend(session, loaded.getBskyAgent(session));
}

export const dropBskyAgent = (session: BskySession) => loaded?.dropBskyAgent(session);
