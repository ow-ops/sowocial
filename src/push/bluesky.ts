import { readItem, removeItem, writeItem } from '@/utils/kv';

import { PUSH_RELAY_URL } from './config';
import { allowNotifications, deliveryFor, type Delivery } from './delivery';
import { forgetDistributor } from './distributor';
import { accountHash } from './payload';

// Bluesky accounts have no server subscription, so the relay keeps this device's registration per DID.
const savedKey = (instance: string) => `push.bsky.${instance}`;

export const isBskyPushOn = (did: string) => !!readItem(savedKey(accountHash({ did })));

async function relayRequest(method: 'PUT' | 'DELETE', body: object) {
  const response = await fetch(`${PUSH_RELAY_URL}/bsky/subscriptions`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (method === 'DELETE' && response.status === 404) return;
  if (!response.ok) throw new Error(`The push relay answered ${response.status}`);
}

async function register(did: string, instance: string) {
  const { delivery, remember } = await deliveryFor(instance);
  await relayRequest('PUT', { did, ...delivery });
  remember();
  writeItem(savedKey(instance), JSON.stringify(delivery));
}

export async function enablePushBsky(did: string) {
  await allowNotifications();
  await register(did, accountHash({ did }));
}

export async function disablePushBsky(did: string) {
  const instance = accountHash({ did });
  const saved = readItem(savedKey(instance));
  if (!saved) return;
  await relayRequest('DELETE', { did, endpoint: (JSON.parse(saved) as Delivery).endpoint });
  forgetDistributor(instance);
  removeItem(savedKey(instance));
}

// The relay can lose a registration across a restart, so every start registers again; PUT is idempotent.
export async function syncPushBsky(did: string) {
  const instance = accountHash({ did });
  if (!readItem(savedKey(instance))) return;
  await register(did, instance);
}
