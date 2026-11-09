import { createIdentityResolver, HANDLE_INVALID, type IdentityResolver } from '@atproto-labs/identity-resolver';
import { extractPdsUrl } from '@atproto/did';

import { t } from '@/i18n';

export const DEFAULT_PDS = 'https://bsky.social';

let resolver: IdentityResolver | undefined;

const getResolver = () =>
  (resolver ??= createIdentityResolver({
    handleResolver: DEFAULT_PDS,
    fetch: (input, init) => globalThis.fetch(input, init),
  }));

export const isUrl = (input: string) => /^https?:\/\//i.test(input.trim());

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  try {
    const { origin } = new URL(isUrl(trimmed) ? trimmed : `https://${trimmed}`);
    if (origin && origin !== 'null') return origin;
  } catch {}
  throw new Error(t('auth.errors.enterPds'));
}

export async function resolveIdentity(identifier: string) {
  try {
    const info = await getResolver().resolve(identifier);
    return {
      did: info.did,
      handle: info.handle === HANDLE_INVALID ? undefined : info.handle,
      pds: extractPdsUrl(info.didDoc).origin,
    };
  } catch (cause) {
    throw new Error(t('auth.errors.pdsNotFound', { identifier }), { cause });
  }
}

export async function resolveServer(identifier: string, explicit?: string): Promise<string> {
  if (explicit?.trim()) return normalizeServerUrl(explicit);
  if (isUrl(identifier)) throw new Error(t('auth.errors.handleNeeded'));
  if (identifier.includes('@') || /\.bsky\.social$/i.test(identifier)) return DEFAULT_PDS;
  return (await resolveIdentity(identifier)).pds;
}
