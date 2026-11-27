import { getBskyAgent } from '@/auth/bsky';
import type { BskySession } from '@/auth/types';

const mockMarkReconnect = jest.fn();
jest.mock('@/auth/session-store', () => ({
  markReconnect: (key: string) => mockMarkReconnect(key),
  saveRefreshedTokens: jest.fn(),
}));
jest.mock('@/api/bsky/backend', () => ({ createBskyBackend: jest.fn() }));
jest.mock('masto', () => ({ MastoHttpError: class extends Error {} }));

type FakeAtp = { session?: object };
let mockResume: (atp: FakeAtp) => Promise<void>;
jest.mock('@atproto/api', () => ({
  asAtprotoProxy: (did: string) => did,
  moderatePost: jest.fn(),
  moderateProfile: jest.fn(),
  AtpAgent: class {
    session?: object;
    sessionManager = { fetchHandler: async () => ({ status: 200 }) };
    resumeSession(data: object) {
      this.session = data;
      return mockResume(this);
    }
  },
  Agent: class {
    fetchHandler: (pathname: string, init?: RequestInit) => Promise<Response>;
    constructor(options: { fetchHandler: (pathname: string, init?: RequestInit) => Promise<Response> }) {
      this.fetchHandler = options.fetchHandler;
    }
    configureProxy() {}
  },
}));

let n = 0;
const bskySession = (): BskySession => {
  const did = `did:plc:test${++n}`;
  return {
    protocol: 'bsky',
    did,
    handle: 'me.test',
    pds: 'https://pds.test',
    auth: 'app-password',
    accountId: did,
    acct: 'me.test',
    appPassword: { did, handle: 'me.test', accessJwt: 'a', refreshJwt: 'r', active: true },
  };
};

const call = (session: BskySession) =>
  (getBskyAgent(session) as unknown as { fetchHandler: (path: string) => Promise<unknown> }).fetchHandler('/xrpc/x');

beforeEach(() => mockMarkReconnect.mockClear());

describe('app password sessions', () => {
  it('stay signed in when resuming fails on the network', async () => {
    mockResume = async () => {
      throw new TypeError('Network request failed');
    };
    await call(bskySession());
    expect(mockMarkReconnect).not.toHaveBeenCalled();
  });

  it('ask to reconnect when the server dropped the session', async () => {
    mockResume = async (atp) => {
      atp.session = undefined;
      throw new Error('ExpiredToken');
    };
    await call(bskySession());
    expect(mockMarkReconnect).toHaveBeenCalledTimes(1);
  });
});
