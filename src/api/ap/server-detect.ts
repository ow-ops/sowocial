import type { mastodon } from 'masto';

export type ReactionApi = 'pleroma' | 'fedibird';

export type ServerFeatures = { software: 'gotosocial' | 'other'; quotes: boolean; reactions?: ReactionApi };

type LooseInstance = mastodon.v1.Instance & {
  pleroma?: { metadata?: { features?: string[] } };
  fedibirdCapabilities?: string[];
};

// Mastodon 4.5 added quote posts. Forks report their own version, so a plain 4.5 or later is what counts.
const atLeast = (version: string, major: number, minor: number) => {
  const [a, b] = version.split('.').map((part) => parseInt(part, 10));
  return a > major || (a === major && b >= minor);
};

// GoToSocial versions start with 0.; Mastodon and its forks start at 1 or higher.
export function detectServer(instance: LooseInstance): ServerFeatures {
  const software = /^0\./.test(instance.version) ? 'gotosocial' : 'other';
  const quotes = software === 'other' && atLeast(instance.version, 4, 5);
  if (instance.pleroma?.metadata?.features?.includes('pleroma_emoji_reactions')) return { software, quotes, reactions: 'pleroma' };
  if (instance.fedibirdCapabilities?.includes('emoji_reaction')) return { software, quotes, reactions: 'fedibird' };
  return { software, quotes };
}

const ADMINISTRATOR = 0x1;
const MANAGE_REPORTS = 0x10;

// GoToSocial names its staff roles; Mastodon grants moderation through permission bits.
export function canModerate(role: mastodon.v1.Role, software: ServerFeatures['software']) {
  if (software === 'gotosocial') return role.name === 'admin' || role.name === 'moderator';
  return (Number(role.permissions) & (ADMINISTRATOR | MANAGE_REPORTS)) !== 0;
}

export type AdminTarget = { kind: 'account' | 'report'; id: string };

// GoToSocial moderates under /settings/moderation, Mastodon and its forks under /admin.
export function adminUrl(instance: string, software: ServerFeatures['software'], { kind, id }: AdminTarget) {
  const base = software === 'gotosocial' ? `${instance}/settings/moderation` : `${instance}/admin`;
  return `${base}/${kind === 'account' ? 'accounts' : 'reports'}/${id}`;
}
