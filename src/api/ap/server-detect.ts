import type { mastodon } from 'masto';

export type ReactionApi = 'pleroma' | 'fedibird';

export type ServerFeatures = { software: 'gotosocial' | 'other'; reactions?: ReactionApi };

type LooseInstance = mastodon.v1.Instance & {
  pleroma?: { metadata?: { features?: string[] } };
  fedibirdCapabilities?: string[];
};

// GoToSocial versions start with 0.; Mastodon and its forks start at 1 or higher.
export function detectServer(instance: LooseInstance): ServerFeatures {
  const software = /^0\./.test(instance.version) ? 'gotosocial' : 'other';
  if (instance.pleroma?.metadata?.features?.includes('pleroma_emoji_reactions')) return { software, reactions: 'pleroma' };
  if (instance.fedibirdCapabilities?.includes('emoji_reaction')) return { software, reactions: 'fedibird' };
  return { software };
}

export type AdminTarget = { kind: 'account' | 'report'; id: string };

// GoToSocial moderates under /settings/moderation, Mastodon and its forks under /admin.
export function adminUrl(instance: string, software: ServerFeatures['software'], { kind, id }: AdminTarget) {
  const base = software === 'gotosocial' ? `${instance}/settings/moderation` : `${instance}/admin`;
  return `${base}/${kind === 'account' ? 'accounts' : 'reports'}/${id}`;
}
