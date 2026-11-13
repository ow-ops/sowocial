export const readItem = (key: string) => globalThis.localStorage?.getItem(key) ?? null;
export const writeItem = (key: string, value: string) => globalThis.localStorage?.setItem(key, value);
export const removeItem = (key: string) => globalThis.localStorage?.removeItem(key);
export const keysWithPrefix = (prefix: string) =>
  Object.keys(globalThis.localStorage ?? {}).filter((key) => key.startsWith(prefix));

export const storage = {
  getItem: async (key: string) => readItem(key),
  setItem: async (key: string, value: string) => writeItem(key, value),
  removeItem: async (key: string) => removeItem(key),
};
