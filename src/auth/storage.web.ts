// expo-secure-store has no web implementation.
export const getItem = async (key: string) => localStorage.getItem(key);
export const setItem = async (key: string, value: string) => localStorage.setItem(key, value);
export const removeItem = async (key: string) => localStorage.removeItem(key);
