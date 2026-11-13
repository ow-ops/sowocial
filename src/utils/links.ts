import type { Href } from 'expo-router';

import type { ResolvedUrl } from '@/api/backend/types';

// Post and profile URL shapes of Mastodon, GoToSocial, Akkoma/Pleroma and Misskey forks.
const FEDI_URL =
  /^https?:\/\/[^/]+\/(@[^/]+(\/statuses)?(\/[\w-]+)?|users\/[^/]+(\/statuses\/[\w-]+)?|notice\/[\w-]+|objects\/[\w-]+|notes\/[\w-]+)\/?$/i;

export const isWebUrl = (href: string) => /^https?:\/\//i.test(href);

export const looksLikeFediverseUrl = (href: string) => FEDI_URL.test(href);

const BSKY_URL =
  /^https?:\/\/bsky\.app\/(?:profile\/([^/?#]+)(?:\/(post|lists)\/([\w-]+))?|starter-pack\/([^/?#]+)\/([\w-]+))\/?(?:[?#].*)?$/i;

export type BskyLink =
  | { kind: 'profile'; handle: string; rkey?: undefined }
  | { kind: 'post' | 'list' | 'starterPack'; handle: string; rkey: string };

// `handle` is a handle or a DID.
export function bskyLink(href: string): BskyLink | null {
  const match = href.match(BSKY_URL);
  if (!match) return null;
  const [, handle, segment, rkey, packHandle, packRkey] = match;
  if (packHandle) return { kind: 'starterPack', handle: packHandle, rkey: packRkey };
  if (!segment) return { kind: 'profile', handle };
  return { kind: segment.toLowerCase() === 'post' ? 'post' : 'list', handle, rkey };
}

// Lists and starter packs open in the app; other bsky.app links go to the browser.
export function bskyRecordLink(href: string) {
  const link = bskyLink(href);
  return link?.kind === 'list' || link?.kind === 'starterPack' ? { ...link, kind: link.kind } : null;
}

export function routeFor({ type, id }: ResolvedUrl): Href {
  if (type === 'list') return { pathname: '/lists/[id]', params: { id } };
  if (type === 'starterPack') return { pathname: '/starter-pack/[id]', params: { id } };
  return `/${type === 'status' ? 'post' : 'account'}/${id}`;
}

const ANCHOR = /<a\s[^>]*>/gi;
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1];

// The first link in a post's HTML that is not a mention or a hashtag.
export function firstLink(html: string) {
  for (const [tag] of html.matchAll(ANCHOR)) {
    const href = attr(tag, 'href')?.replaceAll('&amp;', '&');
    const className = attr(tag, 'class') ?? '';
    if (href && isWebUrl(href) && !/\b(mention|hashtag)\b/.test(className)) return href;
  }
}

export function localStatusId(href: string, instance: string) {
  try {
    const url = new URL(href);
    if (url.host !== new URL(instance).host) return;
    return url.pathname.match(/^\/@[^/]+\/statuses\/([\w-]+)\/?$/)?.[1];
  } catch {}
}
