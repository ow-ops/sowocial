import { createStore, useStore } from 'zustand';

// Kept out of the session module so the theme can read it without loading the API clients.
export const activeAccountStore = createStore<{ key: string | null }>(() => ({ key: null }));

export const useActiveAccountKey = () => useStore(activeAccountStore, (s) => s.key);
