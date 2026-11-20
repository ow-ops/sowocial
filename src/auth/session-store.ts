import type { AtpSessionData } from '@atproto/api';
import { createStore } from 'zustand';

import { accountKey } from './account-key';
import { activeAccountStore } from './active-account';
import { saveAccounts, type Accounts } from './session-storage';
import type { Session } from './types';

type State = Accounts & { last: Session | null; reconnect: ReadonlySet<string>; isLoading: boolean };

export const sessionStore = createStore<State>(() => ({ sessions: [], active: null, last: null, reconnect: new Set(), isLoading: true }));

sessionStore.subscribe((state, prev) => {
  if (state.active !== prev.active) activeAccountStore.setState({ key: state.active });
});

export const find = (sessions: Session[], key: string | null) => sessions.find((s) => accountKey(s) === key) ?? null;

export const findSession = (key: string) => find(sessionStore.getState().sessions, key);

// Calls back with each account that becomes active, including the one restored at launch.
export const onActiveAccount = (listener: (session: Session) => void) =>
  sessionStore.subscribe((state, prev) => {
    if (state.active === prev.active) return;
    const active = find(state.sessions, state.active);
    if (active) listener(active);
  });

export function getActiveSession() {
  const { sessions, active, last } = sessionStore.getState();
  return find(sessions, active) ?? last;
}

let writes: Promise<unknown> = Promise.resolve();

// Writes run one at a time, each deriving its state from the live store, so none overwrites another with a stale snapshot.
export function commit(update: (current: Accounts) => Accounts, onActiveChange?: (active: string | null) => void) {
  const run = writes.then(async () => {
    const prev = sessionStore.getState();
    const next = update(prev);
    if (next === prev) return;
    await saveAccounts(prev, next);
    sessionStore.setState({ sessions: next.sessions, active: next.active, last: find(next.sessions, next.active) ?? prev.last });
    if (next.active !== prev.active) onActiveChange?.(next.active);
  });
  writes = run.catch(() => {});
  return run;
}

export const markReconnect = (key: string) =>
  sessionStore.setState((s) => (s.reconnect.has(key) ? s : { reconnect: new Set(s.reconnect).add(key) }));

export const clearReconnect = (key: string) =>
  sessionStore.setState((s) => (s.reconnect.has(key) ? { reconnect: new Set([...s.reconnect].filter((k) => k !== key)) } : s));

export const saveRefreshedTokens = (key: string, tokens: AtpSessionData) =>
  commit((current) => {
    const target = find(current.sessions, key);
    if (!target || target.protocol !== 'bsky') return current;
    return { ...current, sessions: current.sessions.map((s) => (s === target ? { ...target, appPassword: tokens } : s)) };
  });
