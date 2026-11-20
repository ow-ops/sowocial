import {
  buildMigrationFragment,
  mergeMigration,
  MIGRATE_PARAM,
  parseMigrationFragment,
  type Store,
} from '@/auth/loopback-migration';
import { loopbackIpHref } from '@/auth/bsky-oauth-config';

const makeStore = (initial: Record<string, string> = {}): Store & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const localhostState = {
  accounts: JSON.stringify(['account.a.1', 'account.b.2']),
  'account.a.1': '{"a":1}',
  'account.b.2': '{"b":2}',
  'active-account': 'account.b.2',
  'sowocial-themes': 'T',
  'compose-draft:account.a.1': 'D',
  'persist-cache': 'huge',
  unrelated: 'x',
};

const roundTrip = (state: Record<string, string>) => {
  const fragment = buildMigrationFragment(makeStore(state));
  return parseMigrationFragment(fragment!)!;
};

describe('loopback migration payload', () => {
  it('carries session and kv keys but not query caches', () => {
    const entries = roundTrip(localhostState);
    expect(Object.keys(entries).sort()).toEqual(
      ['account.a.1', 'account.b.2', 'accounts', 'active-account', 'compose-draft:account.a.1', 'sowocial-themes'].sort(),
    );
  });

  it('carries a payload too large to spread into one call', () => {
    const big = 'x'.repeat(500_000);
    const entries = roundTrip({ ...localhostState, 'account.a.1': big });
    expect(entries['account.a.1']).toBe(big);
  });

  it('is skipped when there are no accounts', () => {
    expect(buildMigrationFragment(makeStore({ 'sowocial-themes': 'T' }))).toBeNull();
  });

  it('ignores malformed fragments', () => {
    expect(parseMigrationFragment('')).toBeNull();
    expect(parseMigrationFragment(`#${MIGRATE_PARAM}=@@@`)).toBeNull();
    expect(parseMigrationFragment(`#${MIGRATE_PARAM}=${btoa('nope')}`)).toBeNull();
    expect(parseMigrationFragment(`#${MIGRATE_PARAM}=${btoa('{"v":2,"entries":{}}')}`)).toBeNull();
    expect(parseMigrationFragment('#other=1')).toBeNull();
  });
});

describe('loopback migration merge', () => {
  it('adds migrated accounts and the migrated active when none exists', () => {
    const store = makeStore();
    mergeMigration(store, roundTrip(localhostState));
    expect(JSON.parse(store.getItem('accounts')!)).toEqual(['account.a.1', 'account.b.2']);
    expect(store.getItem('account.a.1')).toBe('{"a":1}');
    expect(store.getItem('active-account')).toBe('account.b.2');
    expect(store.getItem('compose-draft:account.a.1')).toBe('D');
  });

  it('keeps existing accounts on conflict and the existing active account', () => {
    const store = makeStore({
      accounts: JSON.stringify(['account.bsky.did', 'account.a.1']),
      'account.bsky.did': 'BSKY',
      'account.a.1': 'LOCAL-WINS',
      'active-account': 'account.bsky.did',
      'sowocial-themes': 'KEEP',
    });
    mergeMigration(store, roundTrip(localhostState));
    expect(JSON.parse(store.getItem('accounts')!)).toEqual(['account.bsky.did', 'account.a.1', 'account.b.2']);
    expect(store.getItem('account.a.1')).toBe('LOCAL-WINS');
    expect(store.getItem('account.b.2')).toBe('{"b":2}');
    expect(store.getItem('active-account')).toBe('account.bsky.did');
    expect(store.getItem('sowocial-themes')).toBe('KEEP');
  });

  it('does not write keys outside the migrated index', () => {
    const store = makeStore();
    mergeMigration(store, { accounts: '["account.a.1"]', 'account.a.1': 'x', evil: 'y', 'account.z': 'z' });
    expect(store.getItem('evil')).toBeNull();
    expect(store.getItem('account.z')).toBeNull();
  });
});

describe('loopback host guard', () => {
  const at = (href: string) => {
    const { origin, hostname, port } = new URL(href);
    return { origin, hostname, port, href };
  };

  it('only redirects localhost', () => {
    expect(loopbackIpHref(at('http://localhost:8081/'))).toBe('http://127.0.0.1:8081/');
    expect(loopbackIpHref(at('http://127.0.0.1:8081/'))).toBeNull();
    expect(loopbackIpHref(at('https://sowocial.ow-ops.eu/'))).toBeNull();
  });
});
