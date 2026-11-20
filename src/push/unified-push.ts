import { requireOptionalNativeModule, type EventSubscription } from 'expo';

type Distributor = { id: string; name: string };
export type UnifiedPushEndpoint = { instance: string; url: string; pubKey: string; auth: string };
type UnifiedPushFailure = { instance: string; reason: string };

type UnifiedPushModule = {
  getDistributors(): Distributor[];
  getSavedDistributor(): string | null;
  saveDistributor(id: string): void;
  register(instance: string, vapid: string | null): void;
  unregister(instance: string): void;
  addListener(event: 'endpoint', listener: (endpoint: UnifiedPushEndpoint) => void): EventSubscription;
  addListener(event: 'registrationFailed', listener: (failure: UnifiedPushFailure) => void): EventSubscription;
};

// Only Android builds include the native module.
export const unifiedPush = requireOptionalNativeModule<UnifiedPushModule>('UnifiedPush');
