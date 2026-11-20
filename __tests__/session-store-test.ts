import { accountKey, ACTIVE_KEY, INDEX_KEY, LEGACY_KEY } from '@/auth/account-key';
import { loadAccounts } from '@/auth/session-storage';
import { clearReconnect, commit, markReconnect, saveRefreshedTokens, sessionStore } from '@/auth/session-store';
import type { ApSession, BskySession, Session } from '@/auth/types';

const mockDisk = new Map<string, string>();
let mockSlowWrites = false;

jest.mock('@/auth/storage', () => ({
  getItem: async (key: string) => mockDisk.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (mockSlowWrites) await new Promise((resolve) => setTimeout(resolve, 20));
    mockDisk.set(key, value);
  },
  removeItem: async (key: string) => void mockDisk.delete(key),
}));

const ap = (id: string): ApSession => ({ protocol: 'ap', instance: 'https://social.test', token: `token-${id}`, accountId: id, acct: `user${id}` });
const bsky = (did: string): BskySession => ({
  protocol: 'bsky',
  did,
  handle: 'alice.test',
  pds: 'https://pds.test',
  auth: 'app-password',
  accountId: did,
  acct: 'alice.test',
  appPassword: { accessJwt: 'old', refreshJwt: 'old', did, handle: 'alice.test', active: true },
});

const first = ap('1');
const second = bsky('did:plc:alice');

const seed = (sessions: Session[], active: string | null) =>
  sessionStore.setState({ sessions, active, last: sessions.find((s) => accountKey(s) === active) ?? null, reconnect: new Set(), isLoading: false });

const stored = (key: string) => JSON.parse(mockDisk.get(key) ?? 'null');

beforeEach(() => {
  mockDisk.clear();
  mockSlowWrites = false;
  seed([first, second], accountKey(first));
});

describe('account commit queue', () => {
  it('keeps an account switch and a token refresh that race', async () => {
    mockSlowWrites = true;
    const tokens = { accessJwt: 'new', refreshJwt: 'new', did: second.did, handle: second.handle, active: true };
    const switched = commit((current) => ({ ...current, active: accountKey(second) }));
    const refreshed = saveRefreshedTokens(accountKey(second), tokens);
    await Promise.all([switched, refreshed]);

    const state = sessionStore.getState();
    expect(state.active).toBe(accountKey(second));
    expect(state.sessions.find((s) => s.protocol === 'bsky')?.appPassword).toEqual(tokens);
    expect(mockDisk.get(ACTIVE_KEY)).toBe(accountKey(second));
    expect(stored(accountKey(second)).appPassword).toEqual(tokens);
  });

  it('does not write a removed account back when its token refresh lands afterwards', async () => {
    mockSlowWrites = true;
    mockDisk.set(accountKey(second), JSON.stringify(second));
    const removed = commit(({ sessions, active }) => ({ sessions: sessions.filter((s) => s !== second), active }));
    const refreshed = saveRefreshedTokens(accountKey(second), { accessJwt: 'late', refreshJwt: 'late', did: second.did, handle: second.handle, active: true });
    await Promise.all([removed, refreshed]);

    expect(sessionStore.getState().sessions).toEqual([first]);
    expect(mockDisk.has(accountKey(second))).toBe(false);
    expect(JSON.parse(mockDisk.get(INDEX_KEY) ?? '[]')).toEqual([accountKey(first)]);
  });

  it('keeps the queue running after an update fails', async () => {
    const failing = commit(() => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await commit((current) => ({ ...current, active: accountKey(second) }));
    expect(sessionStore.getState().active).toBe(accountKey(second));
  });

  it('reports an active change only when the active account moved', async () => {
    const onActiveChange = jest.fn();
    await commit((current) => ({ ...current }), onActiveChange);
    expect(onActiveChange).not.toHaveBeenCalled();
    await commit((current) => ({ ...current, active: accountKey(second) }), onActiveChange);
    expect(onActiveChange).toHaveBeenCalledWith(accountKey(second));
  });

  it('keeps the last active session after the final account is removed', async () => {
    await commit(() => ({ sessions: [], active: null }));
    expect(sessionStore.getState().last).toBe(first);
  });
});

describe('reconnect flags', () => {
  it('marks and clears an account without touching the others', () => {
    markReconnect('a');
    markReconnect('b');
    clearReconnect('a');
    expect([...sessionStore.getState().reconnect]).toEqual(['b']);
  });

  it('keeps the same set when nothing changes', () => {
    markReconnect('a');
    const before = sessionStore.getState().reconnect;
    markReconnect('a');
    clearReconnect('missing');
    expect(sessionStore.getState().reconnect).toBe(before);
  });
});

describe('loading accounts from storage', () => {
  const save = (sessions: Session[], active?: string) => {
    mockDisk.set(INDEX_KEY, JSON.stringify(sessions.map(accountKey)));
    for (const s of sessions) mockDisk.set(accountKey(s), JSON.stringify(s));
    if (active) mockDisk.set(ACTIVE_KEY, active);
  };

  it('restores the stored sessions and the active one', async () => {
    save([first, second], accountKey(second));
    const { sessions, active } = await loadAccounts();
    expect(sessions.map(accountKey)).toEqual([accountKey(first), accountKey(second)]);
    expect(active).toBe(accountKey(second));
  });

  it('falls back to the first session when the active key is stale', async () => {
    save([first, second], 'account.gone');
    expect((await loadAccounts()).active).toBe(accountKey(first));
  });

  it('skips sessions that are missing or corrupt', async () => {
    save([first]);
    mockDisk.set(INDEX_KEY, JSON.stringify([accountKey(first), 'account.missing', 'account.corrupt']));
    mockDisk.set('account.corrupt', '{nope');
    expect((await loadAccounts()).sessions).toHaveLength(1);
  });

  it('migrates the legacy single session and removes its key', async () => {
    mockDisk.set(LEGACY_KEY, JSON.stringify(first));
    const { sessions, active } = await loadAccounts();
    expect(sessions.map(accountKey)).toEqual([accountKey(first)]);
    expect(active).toBe(accountKey(first));
    expect(mockDisk.has(LEGACY_KEY)).toBe(false);
    expect(JSON.parse(mockDisk.get(INDEX_KEY) ?? '[]')).toEqual([accountKey(first)]);
    expect(stored(accountKey(first))).toMatchObject({ token: first.token });
  });

  it('drops a legacy session that is already stored as an account', async () => {
    save([first], accountKey(first));
    mockDisk.set(LEGACY_KEY, JSON.stringify({ ...first, token: 'stale' }));
    const { sessions } = await loadAccounts();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ token: first.token });
    expect(mockDisk.has(LEGACY_KEY)).toBe(false);
  });
});
