import type { QueryClient } from '@tanstack/react-query';
import { createRestAPIClient } from 'masto';

import { forgetMasto } from '@/api/clients';
import { deleteAccountCache, switchAccountCache } from '@/api/persist';
import { pushOperations } from '@/push/operations';
import { clearAccountTheme } from '@/theme/store';
import { dropOutboxAccount } from '@/utils/outbox-store';
import { accountKey } from './account-key';
import { dropBskyAgent, loadBsky } from './bsky-loader';
import { cleanServices, type BskyServices } from './bsky-services';
import { revokeToken } from './oauth';
import { clearReconnect, commit, sessionStore } from './session-store';
import type { ApSession, BskySession, Session } from './types';

async function endSession(target: Session) {
  if (target.protocol === 'bsky') await (await loadBsky()).signOutBsky(target);
  else await revokeToken(target);
}

export function accountActions(queryClient: QueryClient) {
  const commitAccounts: typeof commit = (update) => commit(update, (active) => void switchAccountCache(queryClient, active));

  const setSession = async (next: Session) => {
    const key = accountKey(next);
    if (next.protocol === 'bsky') dropBskyAgent(next);
    clearReconnect(key);
    await commitAccounts(({ sessions }) => ({
      sessions: sessions.some((s) => accountKey(s) === key) ? sessions.map((s) => (accountKey(s) === key ? next : s)) : [...sessions, next],
      active: key,
    }));
  };

  const switchAccount = async (target: Session) => {
    const key = accountKey(target);
    await commitAccounts((current) => (current.sessions.some((s) => accountKey(s) === key) ? { ...current, active: key } : current));
  };

  const setServices = async (target: BskySession, services: BskyServices | undefined) => {
    const key = accountKey(target);
    dropBskyAgent({ ...target, services: cleanServices(services) });
    await commitAccounts((current) => ({
      ...current,
      sessions: current.sessions.map((s) => (s.protocol === 'bsky' && accountKey(s) === key ? { ...s, services: cleanServices(services) } : s)),
    }));
    await deleteAccountCache(queryClient, key);
    const { active } = sessionStore.getState();
    if (key === active) await switchAccountCache(queryClient, active);
  };

  const removeAccount = async (target: Session) => {
    const key = accountKey(target);
    const disablePush = pushOperations(target).disable();
    forgetMasto(key);
    clearReconnect(key);
    await commitAccounts(({ sessions, active }) => {
      const rest = sessions.filter((s) => accountKey(s) !== key);
      return { sessions: rest, active: key === active ? (rest[0] ? accountKey(rest[0]) : null) : active };
    });
    await deleteAccountCache(queryClient, key);
    dropOutboxAccount(key);
    clearAccountTheme(key);
    // The subscription goes first: it needs the token endSession revokes.
    disablePush.catch(() => {}).then(() => endSession(target)).catch(() => {});
  };

  return { setSession, switchAccount, setServices, removeAccount };
}

export function backfillAcct(sessions: Session[]) {
  const missing = sessions.filter((s): s is ApSession => s.protocol === 'ap' && !s.acct);
  for (const target of missing) {
    createRestAPIClient({ url: target.instance, accessToken: target.token })
      .v1.accounts.verifyCredentials()
      .then(({ acct }) => {
        const key = accountKey(target);
        return commit((current) => ({
          ...current,
          sessions: current.sessions.map((s) => (accountKey(s) === key ? { ...s, acct } : s)),
        }));
      })
      .catch(() => {});
  }
}
