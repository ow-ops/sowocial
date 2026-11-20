import { mastoFor } from '@/api/clients';
import type { Session } from '@/auth/types';

import { disablePushBsky, enablePushBsky, isBskyPushOn, syncPushBsky } from './bluesky';
import { disablePush, enablePush, isOurSubscription, syncPush } from './mastodon';

export function pushOperations(session: Session) {
  if (session.protocol === 'bsky') {
    const { did } = session;
    return {
      credential: did,
      explanation: {
        relay: 'notifications.push.explanationBsky',
        distributor: 'notifications.push.explanationBskyDistributor',
      },
      isOn: async () => isBskyPushOn(did),
      enable: () => enablePushBsky(did),
      disable: () => disablePushBsky(did),
      sync: () => syncPushBsky(did),
    } as const;
  }
  const { token } = session;
  const masto = mastoFor(session);
  return {
    credential: token,
    explanation: {
      relay: 'notifications.push.explanation',
      distributor: 'notifications.push.explanationDistributor',
    },
    // Servers answer 404 when this token has no subscription.
    isOn: async () => {
      const subscription = await masto.v1.push.subscription.fetch().catch(() => null);
      return !!subscription && isOurSubscription(subscription.endpoint, token);
    },
    enable: () => enablePush(masto, token),
    disable: () => disablePush(masto, token),
    sync: () => syncPush(masto, token),
  } as const;
}
