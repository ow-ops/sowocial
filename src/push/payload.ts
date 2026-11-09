import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// The relay sends `{ m: <base64 Web Push body> }` as the FCM data, found under `data` in the task payload.
export function pushMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { m } = data as Record<string, unknown>;
  return typeof m === 'string' ? m : null;
}

// The UnifiedPush service forwards the plaintext the connector already decrypted.
export function unifiedPushMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { up } = data as Record<string, unknown>;
  return typeof up === 'string' ? up : null;
}

// Notification data is stored unencrypted on Android, so it carries a hash of the token, never the token.
export function tokenHash(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(token)));
}

// What Mastodon and GoToSocial encrypt into a Web Push.
export type MastodonPush = {
  access_token?: string;
  title?: string;
  body?: string;
};
