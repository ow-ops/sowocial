import type { Agent } from '@atproto/api';

import type { BskySession } from './types';

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
