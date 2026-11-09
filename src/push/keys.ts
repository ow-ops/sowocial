import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { PUSH_KEYCHAIN_SERVICE, PUSH_KEYS_KEY } from './config';
import { base64url, createPushKeys, fromBase64, type PushKeys } from './webpush';

// Pushes arrive while the phone is locked, so the keys must be readable after first unlock.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: PUSH_KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

type Stored = { privateKey: string; publicKey: string; auth: string };

export async function loadPushKeys(): Promise<PushKeys | null> {
  const saved = await SecureStore.getItemAsync(PUSH_KEYS_KEY, OPTIONS);
  if (!saved) return null;
  const { privateKey, publicKey, auth } = JSON.parse(saved) as Stored;
  return { privateKey: fromBase64(privateKey), publicKey: fromBase64(publicKey), auth: fromBase64(auth) };
}

export async function getOrCreatePushKeys(): Promise<PushKeys> {
  const existing = await loadPushKeys();
  if (existing) return existing;
  const keys = createPushKeys(getRandomBytes);
  const stored: Stored = {
    privateKey: base64url(keys.privateKey),
    publicKey: base64url(keys.publicKey),
    auth: base64url(keys.auth),
  };
  await SecureStore.setItemAsync(PUSH_KEYS_KEY, JSON.stringify(stored), OPTIONS);
  return keys;
}
