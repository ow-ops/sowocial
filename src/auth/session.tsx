import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, type ReactNode } from 'react';
import { useStore } from 'zustand';

import { setInitialAccount } from '@/api/persist';
import { accountActions, backfillAcct } from './account-actions';
import { accountKey } from './account-key';
import { watchAuthFailures } from './auth-failure';
import { loadBsky } from './bsky-loader';
import { type BskyServices } from './bsky-services';
import { loadAccounts } from './session-storage';
import { find, sessionStore } from './session-store';
import type { ApSession, BskySession, Session } from './types';

export { accountKey };
export { findSession, getActiveSession, onActiveAccount } from './session-store';

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

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const state = useStore(sessionStore);

  useEffect(() => {
    loadAccounts()
      .then(async (loaded) => {
        if (loaded.sessions.some((s) => s.protocol === 'bsky')) await loadBsky();
        sessionStore.setState({ ...loaded, last: find(loaded.sessions, loaded.active) });
        setInitialAccount(loaded.active);
        backfillAcct(loaded.sessions);
      })
      .catch(() => setInitialAccount(null))
      .finally(() => sessionStore.setState({ isLoading: false }));
  }, [queryClient]);

  useEffect(() => watchAuthFailures(queryClient), [queryClient]);

  const actions = accountActions(queryClient);
  const session = find(state.sessions, state.active);

  return (
    <SessionContext
      value={{
        session,
        sessions: state.sessions,
        lastSession: state.last,
        needsReconnect: !!session && state.reconnect.has(accountKey(session)),
        reconnect: state.reconnect,
        isLoading: state.isLoading,
        ...actions,
        signOut: async () => {
          if (session) await actions.removeAccount(session);
        },
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
