import Storage from 'expo-sqlite/kv-store';

// Synchronous so the saved theme applies on the first frame.
export const readItem = (key: string) => Storage.getItemSync(key);
export const writeItem = (key: string, value: string) => Storage.setItemSync(key, value);
export const removeItem = (key: string) => void Storage.removeItemSync(key);
export const keysWithPrefix = (prefix: string) => Storage.getAllKeysSync().filter((key) => key.startsWith(prefix));

export const storage = Storage;
