import { t } from '@/i18n';
import { readItem, removeItem, writeItem } from '@/utils/kv';

import { unifiedPush, type UnifiedPushEndpoint } from './unified-push';

// Set when the user picks the relay on a phone that has a UnifiedPush distributor.
const RELAY_PREFERRED_KEY = 'push.relay';
const REGISTRATION_TIMEOUT_MS = 15_000;

// The endpoint and keys the server holds for an account delivering through UnifiedPush.
const savedKey = (instance: string) => `push.up.${instance}`;

export function chooseDistributor(available: string[], saved: string | null): string | null {
  if (saved && available.includes(saved)) return saved;
  return available[0] ?? null;
}

export function pushDistributors() {
  return unifiedPush?.getDistributors() ?? [];
}

// The distributor pushes go through, or null for the relay.
export function activeDistributor() {
  if (!unifiedPush || readItem(RELAY_PREFERRED_KEY)) return null;
  return chooseDistributor(
    pushDistributors().map((d) => d.id),
    unifiedPush.getSavedDistributor(),
  );
}

export function chooseDelivery(distributor: string | null) {
  if (!unifiedPush) return;
  if (distributor) {
    removeItem(RELAY_PREFERRED_KEY);
    unifiedPush.saveDistributor(distributor);
  } else {
    writeItem(RELAY_PREFERRED_KEY, '1');
  }
}

export const endpointRecord = ({ url, pubKey, auth }: UnifiedPushEndpoint) => JSON.stringify({ url, pubKey, auth });

export const savedEndpoint = (instance: string) => readItem(savedKey(instance));

export const saveEndpoint = (instance: string, endpoint: UnifiedPushEndpoint) =>
  writeItem(savedKey(instance), endpointRecord(endpoint));

export const savedEndpointUrl = (instance: string) => {
  const saved = savedEndpoint(instance);
  return saved ? (JSON.parse(saved) as { url: string }).url : null;
};

export function forgetDistributor(instance: string) {
  if (savedEndpoint(instance)) {
    unifiedPush?.unregister(instance);
    removeItem(savedKey(instance));
  }
}

export function forgetSavedEndpoint(instance: string) {
  removeItem(savedKey(instance));
}

export function registerEndpoint(distributor: string, instance: string, vapid: string | null) {
  const native = unifiedPush!;
  return new Promise<UnifiedPushEndpoint>((resolve, reject) => {
    const subscriptions = [
      native.addListener('endpoint', (endpoint) => {
        if (endpoint.instance === instance) settle(() => resolve(endpoint));
      }),
      native.addListener('registrationFailed', (failure) => {
        if (failure.instance === instance) {
          settle(() => reject(new Error(t('notifications.push.registrationFailed', { reason: failure.reason }))));
        }
      }),
    ];
    const timer = setTimeout(
      () => settle(() => reject(new Error(t('notifications.push.distributorSilent')))),
      REGISTRATION_TIMEOUT_MS,
    );
    const settle = (finish: () => void) => {
      clearTimeout(timer);
      subscriptions.forEach((subscription) => subscription.remove());
      finish();
    };
    // The connector only registers with the saved distributor, and the default pick was never saved.
    native.saveDistributor(distributor);
    native.register(instance, vapid);
  });
}
