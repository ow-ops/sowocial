import { fetchLinkPreview as scrape } from 'sowocial-link-preview';

// Open Graph keys from sable-link-preview; posts also carry `note:` keys that this card does not read.
export type LinkPreview = {
  'og:title'?: string;
  'og:description'?: string;
  'og:site_name'?: string;
  'og:image'?: string;
  'og:image:width'?: number;
  'og:image:height'?: number;
  'og:image:alt'?: string;
};

export async function fetchLinkPreview(url: string, signal?: AbortSignal) {
  const json = await scrape(url, signal && { signal });
  return json ? (JSON.parse(json) as LinkPreview) : null;
}
