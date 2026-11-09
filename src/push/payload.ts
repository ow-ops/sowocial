import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// The relay sends `{ m: <base64 Web Push body> }` as the push data. Android's background
// task gets it as a JSON string in `dataString`; other paths may hand over the object.
export function pushMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record.m === 'string') return record.m;
  for (const key of ['dataString', 'body']) {
    const value = record[key];
    if (typeof value === 'string') {
      try {
        return pushMessage(JSON.parse(value));
      } catch {
        continue;
      }
    }
    if (value && typeof value === 'object') return pushMessage(value);
  }
  return null;
}

// Notification data is stored unencrypted on Android, so it carries a hash of the token, never the token.
export function tokenHash(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(token)));
}

// What Mastodon and GoToSocial encrypt into a Web Push.
export type MastodonPush = {
  access_token?: string;
  notification_id?: string | number;
  notification_type?: string;
  title?: string;
  body?: string;
};
