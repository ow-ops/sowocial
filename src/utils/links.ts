// Post and profile URL shapes of Mastodon, GoToSocial, Akkoma/Pleroma and Misskey forks.
const FEDI_URL =
  /^https?:\/\/[^/]+\/(@[^/]+(\/statuses)?(\/[\w-]+)?|users\/[^/]+(\/statuses\/[\w-]+)?|notice\/[\w-]+|objects\/[\w-]+|notes\/[\w-]+)\/?$/i;

export const isWebUrl = (href: string) => /^https?:\/\//i.test(href);

export const looksLikeFediverseUrl = (href: string) => FEDI_URL.test(href);

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
