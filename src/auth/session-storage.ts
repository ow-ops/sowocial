import { accountKey, ACTIVE_KEY, INDEX_KEY, LEGACY_KEY } from './account-key';
import { parseSession } from './instance';
import * as storage from './storage';
import type { Session } from './types';

export type Accounts = { sessions: Session[]; active: string | null };

const parse = (raw: string | null): unknown => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const sameKeys = (a: Session[], b: Session[]) => a.length === b.length && a.every((s, i) => accountKey(s) === accountKey(b[i]));

export async function saveAccounts(prev: Accounts, next: Accounts) {
  const before = new Map(prev.sessions.map((s) => [accountKey(s), s]));
  await Promise.all(
    next.sessions
      .filter((s) => before.get(accountKey(s)) !== s)
      .map((s) => storage.setItem(accountKey(s), JSON.stringify(s))),
  );
  if (!sameKeys(prev.sessions, next.sessions)) {
    await storage.setItem(INDEX_KEY, JSON.stringify(next.sessions.map(accountKey)));
  }
  const kept = new Set(next.sessions.map(accountKey));
  await Promise.all(prev.sessions.filter((s) => !kept.has(accountKey(s))).map((s) => storage.removeItem(accountKey(s))));
  if (next.active === prev.active) return;
  if (next.active) await storage.setItem(ACTIVE_KEY, next.active);
  else await storage.removeItem(ACTIVE_KEY);
}

export async function loadAccounts(): Promise<Accounts> {
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
      await saveAccounts(prev, { sessions, active });
    }
    await storage.removeItem(LEGACY_KEY);
  }

  if (!sessions.some((s) => accountKey(s) === active)) active = sessions[0] ? accountKey(sessions[0]) : null;
  return { sessions, active };
}
