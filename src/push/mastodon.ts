import type { mastodon } from 'masto';

import { PUSH_RELAY_URL } from './config';
import { allowNotifications, deliveryFor, relayEndpoint } from './delivery';
import {
  activeDistributor,
  endpointRecord,
  forgetDistributor,
  registerEndpoint,
  saveEndpoint,
  savedEndpoint,
  savedEndpointUrl,
} from './distributor';
import { tokenHash } from './payload';

type SubscriptionParams = Parameters<mastodon.rest.Client['v1']['push']['subscription']['create']>[0];

const ALERTS = {
  mention: true,
  status: true,
  reblog: true,
  follow: true,
  followRequest: true,
  favourite: true,
  poll: true,
  update: true,
  quote: true,
  quoted_update: true,
  // masto leaves keys containing a colon as they are; `admin.*` alerts would be rewritten to `admin_*`.
  'pleroma:emoji_reaction': true,
};

// Another app may have subscribed with this token; only ours goes through the relay or the saved endpoint.
export function isOurSubscription(endpoint: string, accountToken: string) {
  return endpoint.startsWith(PUSH_RELAY_URL) || savedEndpointUrl(tokenHash(accountToken)) === endpoint;
}

function params(endpoint: string, p256dh: string, auth: string) {
  // `standard` makes Mastodon 4.4+ use RFC 8291, the only encoding the relay and app accept.
  // masto's types omit it and put `policy` at the top level instead of under `data`, so fill both.
  return {
    subscription: { endpoint, keys: { p256dh, auth }, standard: true },
    data: { alerts: ALERTS, policy: 'all' },
    policy: 'all',
  } as SubscriptionParams;
}

async function vapidKey(masto: mastodon.rest.Client) {
  const instance = await masto.v2.instance.fetch();
  return instance.configuration.vapid?.publicKey ?? null;
}

// The server encrypts to our keys and posts to the relay, which forwards the ciphertext to APNs or FCM.
// With a UnifiedPush distributor, the server posts straight to the distributor's endpoint instead.
export async function enablePush(masto: mastodon.rest.Client, accountToken: string) {
  await allowNotifications();

  const { delivery, remember } = await deliveryFor(tokenHash(accountToken), () => vapidKey(masto));
  const subscription = await masto.v1.push.subscription.create(
    params(delivery.endpoint, delivery.p256dh, delivery.auth),
  );
  remember();
  return subscription;
}

export async function disablePush(masto: mastodon.rest.Client, accountToken: string) {
  forgetDistributor(tokenHash(accountToken));
  await masto.v1.push.subscription.remove();
}

// Runs at app start: a distributor can hand out a new endpoint or disappear between runs, and
// APNs or FCM can issue a new device token.
export async function syncPush(masto: mastodon.rest.Client, accountToken: string) {
  const instance = tokenHash(accountToken);
  const saved = savedEndpoint(instance);
  const distributor = activeDistributor();
  if (saved && distributor) {
    const endpoint = await registerEndpoint(distributor, instance, await vapidKey(masto));
    if (endpointRecord(endpoint) !== saved) {
      await masto.v1.push.subscription.create(params(endpoint.url, endpoint.pubKey, endpoint.auth));
      saveEndpoint(instance, endpoint);
    }
    return;
  }
  if (saved) {
    await enablePush(masto, accountToken);
    return;
  }
  const current = await masto.v1.push.subscription.fetch().catch(() => null);
  if (current?.endpoint.startsWith(PUSH_RELAY_URL) && current.endpoint !== (await relayEndpoint())) {
    await enablePush(masto, accountToken);
  }
}
