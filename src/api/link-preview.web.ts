import type { LinkPreview } from './link-preview';

export type { LinkPreview } from './link-preview';

// The scraper is a native module; browsers cannot fetch other origins' pages anyway.
export async function fetchLinkPreview(_url: string, _signal?: AbortSignal): Promise<LinkPreview | null> {
  return null;
}
