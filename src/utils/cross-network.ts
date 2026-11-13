import { contentToText, type RichContent } from '@/model/content';
import { profileUrl } from '@/model/adapters/bsky';
import type { Author, Protocol } from '@/model/post';

import { domainOf } from './acct';
import { bskyLink } from './links';

// `handle` is a Bluesky handle, or `user@instance` for a fediverse account.
export type Identity = { protocol: Protocol; handle: string };

const BRIDGED_FEDIVERSE = /^(\w+)\.(.+)\.ap\.brid\.gy$/i;
const BRIDGED_BLUESKY = /^(.+)@bsky\.brid\.gy$/i;
const FEDIVERSE_PROFILE_URL = /^https?:\/\/([^/?#]+)\/@(\w+)\/?$/i;
const FEDIVERSE_HANDLE_TEXT = /(?<![\w@])@(\w+)@((?:[a-z0-9-]+\.)+[a-z]{2,})/i;

const hrefsOf = (content: RichContent) =>
  content.kind === 'html'
    ? [...content.html.matchAll(/href="([^"]*)"/g)].map(([, href]) => href.replaceAll('&amp;', '&'))
    : content.segments.flatMap((s) => (s.type === 'link' ? [s.url] : []));

const declaredIn = (author: Author): RichContent[] =>
  [author.note, ...(author.fields ?? []).map((f) => f.value)].filter((c): c is RichContent => !!c);

// Bridgy Fed names a bridged fediverse account `user.instance.ap.brid.gy` and a bridged Bluesky account
// `handle@bsky.brid.gy`; fediverse usernames contain no dots, so the first label is the user.
const bridgedIdentity = (author: Author): Identity | null => {
  if (author.protocol === 'bsky') {
    const match = author.handle.match(BRIDGED_FEDIVERSE);
    return match ? { protocol: 'ap', handle: `${match[1]}@${match[2]}` } : null;
  }
  const match = author.handle.match(BRIDGED_BLUESKY);
  return match ? { protocol: 'bsky', handle: match[1] } : null;
};

const identityOfHref: Record<Protocol, (href: string) => Identity | null> = {
  ap: (href) => {
    const link = bskyLink(href);
    return link?.kind === 'profile' ? { protocol: 'bsky', handle: link.handle } : null;
  },
  bsky: (href) => {
    const match = href.match(FEDIVERSE_PROFILE_URL);
    return match ? { protocol: 'ap', handle: `${match[2]}@${match[1]}` } : null;
  },
};

const declaredIdentity = (author: Author): Identity | null => {
  const fromHref = identityOfHref[author.protocol];
  for (const content of declaredIn(author)) {
    for (const href of hrefsOf(content)) {
      const found = fromHref(href);
      if (found) return found;
    }
    if (author.protocol === 'bsky') {
      const match = contentToText(content).match(FEDIVERSE_HANDLE_TEXT);
      if (match) return { protocol: 'ap', handle: `${match[1]}@${match[2]}` };
    }
  }
  return null;
};

export const crossNetworkIdentity = (author: Author): Identity | null => bridgedIdentity(author) ?? declaredIdentity(author);

export const identityUrl = ({ protocol, handle }: Identity) =>
  protocol === 'bsky' ? profileUrl(handle) : `https://${domainOf(handle)}/@${handle.split('@')[0]}`;
