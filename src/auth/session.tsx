import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createRestAPIClient } from 'masto';
import { createContext, use, useEffect, type ReactNode } from 'react';
import { createStore, useStore } from 'zustand';

import { accountOf } from '@/api/keys';
import { deleteAccountCache, setInitialAccount, switchAccountCache } from '@/api/persist';
import { accountKey, ACTIVE_KEY, INDEX_KEY, LEGACY_KEY } from './account-key';
import { isAuthFailure } from './auth-failure';
import { dropBskyAgent, loadBsky, setBskyHooks } from './bsky-loader';
import { cleanServices, type BskyServices } from './bsky-services';
import { parseSession } from './instance';
import { revokeToken } from './oauth';
import { dropOutboxAccount } from '@/utils/outbox-store';
import * as storage from './storage';
import type { ApSession, BskySession, Session } from './types';

export { accountKey };


type SessionContextValue = {
  session: Session | null;
  sessions: Session[];
  lastSession: Session | null;
  needsReconnect: boolean;
  reconnect: ReadonlySet<string>;
  isLoading: boolean;
  setSession: (session: Session) => Promise<void>;
  switchAccount: (session: Session) => Promise<void>;
  setServices: (session: BskySession, services: BskyServices | undefined) => Promise<void>;
  signOut: () => Promise<void>;
  removeAccount: (session: Session) => Promise<void>;
};

type Accounts = { sessions: Session[]; active: string | null };
type State = Accounts & { last: Session | null; reconnect: ReadonlySet<string>; isLoading: boolean };

const SessionContext = createContext<SessionContextValue | null>(null);

type CacheEvent = { type: string; query?: { queryKey: readonly unknown[] }; action?: { type: string; error?: unknown } };

const markReconnect = (key: string) => sessionStore.setState((s) => (s.reconnect.has(key) ? s : { reconnect: new Set(s.reconnect).add(key) }));

function failedAccount(event: CacheEvent) {
  if (event.type !== 'updated' || event.action?.type !== 'error') return null;
  const queryKey = event.query?.queryKey;
  const scope = queryKey && accountOf(queryKey);
  const { sessions, active } = sessionStore.getState();
  const session = find(sessions, scope ?? active);
  return session && isAuthFailure(session.protocol, event.action.error, queryKey) ? accountKey(session) : null;
}

const parse = (raw: string | null): unknown => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const sameKeys = (a: Session[], b: Session[]) => a.length === b.length && a.every((s, i) => accountKey(s) === accountKey(b[i]));

async function persist(prev: Accounts, next: Accounts) {
  const before = new Map(prev.sessions.map((s) => [accountKey(s), s]));
  await Promise.all(
    next.sessions
      .filter((s) => before.get(accountKey(s)) !== s)
      .map((s) => storage.setItem(accountKey(s), JSON.stringify(s))),
  );
  if (!sameKeys(prev.sessions, next.sessions)) {
    await storage.setItem(INDEX_KEY, JSON.stringify(next.sessions.map(accountKey)));
  }
  if (next.active === prev.active) return;
  if (next.active) await storage.setItem(ACTIVE_KEY, next.active);
  else await storage.removeItem(ACTIVE_KEY);
}

async function load(): Promise<Accounts> {
  const keys = parse(await storage.getItem(INDEX_KEY));
  const sessions: Session[] = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    const stored = parseSession(parse(typeof key === 'string' ? await storage.getItem(key) : null));
    if (stored) sessions.push(stored);
  }
  const stored = await storage.getItem(ACTIVE_KEY);
  let active = stored;

  const rawLegacy = await storage.getItem(LEGACY_KEY);
  if (rawLegacy) {
    const legacy = parseSession(parse(rawLegacy));
    if (legacy && !sessions.some((s) => accountKey(s) === accountKey(legacy))) {
      const prev = { sessions: [...sessions], active: stored };
      sessions.push(legacy);
      active ??= accountKey(legacy);
      await persist(prev, { sessions, active });
    }
    await storage.removeItem(LEGACY_KEY);
  }

  if (!sessions.some((s) => accountKey(s) === active)) active = sessions[0] ? accountKey(sessions[0]) : null;
  return { sessions, active };
}

const sessionStore = createStore<State>(() => ({ sessions: [], active: null, last: null, reconnect: new Set(), isLoading: true }));

const find = (sessions: Session[], key: string | null) => sessions.find((s) => accountKey(s) === key) ?? null;

export const findSession = (key: string) => find(sessionStore.getState().sessions, key);

export function getActiveSession() {
  const { sessions, active, last } = sessionStore.getState();
  return find(sessions, active) ?? last;
}

async function commit(queryClient: QueryClient, next: Accounts) {
  const prev = sessionStore.getState();
  await persist(prev, next);
  sessionStore.setState({ ...next, last: find(next.sessions, next.active) ?? prev.last });
  if (next.active !== prev.active) void switchAccountCache(queryClient, next.active);
}

async function endSession(target: Session) {
  if (target.protocol === 'bsky') await (await loadBsky()).signOutBsky(target);
  else await revokeToken(target);
}

function backfillAcct(queryClient: QueryClient, sessions: Session[]) {
  const missing = sessions.filter((s): s is ApSession => s.protocol === 'ap' && !s.acct);
  for (const target of missing) {
    createRestAPIClient({ url: target.instance, accessToken: target.token })
      .v1.accounts.verifyCredentials()
      .then(({ acct }) => {
        const { sessions: current, active } = sessionStore.getState();
        const key = accountKey(target);
        return commit(queryClient, {
          sessions: current.map((s) => (accountKey(s) === key ? { ...s, acct } : s)),
          active,
        });
      })
      .catch(() => {});
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const state = useStore(sessionStore);

  useEffect(() => {
    load()
      .then(async (loaded) => {
        if (loaded.sessions.some((s) => s.protocol === 'bsky')) await loadBsky();
        sessionStore.setState({ ...loaded, last: find(loaded.sessions, loaded.active) });
        setInitialAccount(loaded.active);
        backfillAcct(queryClient, loaded.sessions);
      })
      .catch(() => setInitialAccount(null))
      .finally(() => sessionStore.setState({ isLoading: false }));
  }, [queryClient]);

  const setSession = async (next: Session) => {
    const key = accountKey(next);
    const { sessions } = sessionStore.getState();
    if (next.protocol === 'bsky') dropBskyAgent(next);
    sessionStore.setState((s) => ({ reconnect: new Set([...s.reconnect].filter((k) => k !== key)) }));
    await commit(queryClient, {
      sessions: sessions.some((s) => accountKey(s) === key) ? sessions.map((s) => (accountKey(s) === key ? next : s)) : [...sessions, next],
      active: key,
    });
  };

  const switchAccount = async (target: Session) => {
    await commit(queryClient, { sessions: sessionStore.getState().sessions, active: accountKey(target) });
  };

  const setServices = async (target: BskySession, services: BskyServices | undefined) => {
    const key = accountKey(target);
    const { sessions, active } = sessionStore.getState();
    const next = { ...target, services: cleanServices(services) };
    dropBskyAgent(next);
    await commit(queryClient, { sessions: sessions.map((s) => (accountKey(s) === key ? next : s)), active });
    await deleteAccountCache(key);
    if (key === active) await switchAccountCache(queryClient, active);
  };

  const removeAccount = async (target: Session) => {
    const key = accountKey(target);
    const { sessions, active } = sessionStore.getState();
    const rest = sessions.filter((s) => accountKey(s) !== key);
    await storage.removeItem(key);
    await commit(queryClient, {
      sessions: rest,
      active: key === active ? (rest[0] ? accountKey(rest[0]) : null) : active,
    });
    await deleteAccountCache(key);
    dropOutboxAccount(key);
    endSession(target).catch(() => {});
  };

  const session = find(state.sessions, state.active);

  const signOut = async () => {
    if (session) await removeAccount(session);
  };

  useEffect(() => {
    setBskyHooks({
      authLost: markReconnect,
      tokensRefreshed: (key, tokens) => {
        const { sessions: current, active } = sessionStore.getState();
        const target = find(current, key);
        if (!target || target.protocol !== 'bsky') return;
        void commit(queryClient, {
          sessions: current.map((s) => (s === target ? { ...target, appPassword: tokens } : s)),
          active,
        });
      },
    });
  }, [queryClient]);

  useEffect(() => {
    const onCacheEvent = (event: CacheEvent) => {
      const key = failedAccount(event);
      if (key) markReconnect(key);
    };
    const unsubscribeQueries = queryClient.getQueryCache().subscribe(onCacheEvent);
    const unsubscribeMutations = queryClient.getMutationCache().subscribe(onCacheEvent);
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient]);

  return (
    <SessionContext
      value={{
        session,
        sessions: state.sessions,
        lastSession: state.last,
        needsReconnect: !!session && state.reconnect.has(accountKey(session)),
        reconnect: state.reconnect,
        isLoading: state.isLoading,
        setSession,
        switchAccount,
        setServices,
        signOut,
        removeAccount,
      }}>
      {children}
    </SessionContext>
  );
}

export function useSession() {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

const ActingContext = createContext<string | null>(null);

export function ActingAccount({ account, children }: { account?: string | null; children: ReactNode }) {
  const inherited = use(ActingContext);
  return <ActingContext value={account || inherited}>{children}</ActingContext>;
}

export const useActingKey = () => use(ActingContext);

// Falls back to the last session so guarded screens can animate out after sign-out.
export function useAuthedSession(): Session {
  const { session, lastSession, sessions } = useSession();
  const acting = use(ActingContext);
  const current = (acting && sessions.find((s) => accountKey(s) === acting)) || session || lastSession;
  if (!current) throw new Error('No active session');
  return current;
}

export function useApSession(): ApSession | null {
  const session = useAuthedSession();
  return session.protocol === 'ap' ? session : null;
}

// The account a screen's queries belong to: the acting account inside ActingAccount, else the active one.
export const useAccountScope = () => accountKey(useAuthedSession());

export function useForeignAccount(): string | undefined {
  const { session, lastSession } = useSession();
  const key = accountKey(useAuthedSession());
  const active = session ?? lastSession;
  return active && key !== accountKey(active) ? key : undefined;
}
