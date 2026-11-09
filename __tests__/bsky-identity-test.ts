import { normalizeServerUrl, resolveIdentity, resolveServer } from '@/auth/bsky-identity';

const DID = 'did:plc:abcdefghijklmnopqrstuvwx';

const didDoc = (id: string, handle: string, pds: string) => ({
  '@context': ['https://www.w3.org/ns/did/v1'],
  id,
  alsoKnownAs: [`at://${handle}`],
  service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: pds }],
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: jest.SpyInstance;

beforeEach(() => {
  fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = decodeURIComponent(String(input instanceof Request ? input.url : input));
    if (url.startsWith('https://bsky.social/xrpc/com.atproto.identity.resolveHandle')) {
      return new URL(url).searchParams.get('handle') === 'alice.wafrn.example'
        ? json({ did: DID })
        : json({ error: 'InvalidRequest', message: 'Unable to resolve handle' }, 400);
    }
    if (url === `https://plc.directory/${DID}`) return json(didDoc(DID, 'alice.wafrn.example', 'https://pds.wafrn.example'));
    if (url === 'https://web.example/.well-known/did.json') {
      return json(didDoc('did:web:web.example', 'web.example', 'https://pds.web.example/'));
    }
    return json({}, 404);
  });
});

afterEach(() => fetchMock.mockRestore());

describe('normalizeServerUrl', () => {
  it('keeps only the origin and adds https when the scheme is missing', () => {
    expect(normalizeServerUrl(' pds.example.com/path?x=1 ')).toBe('https://pds.example.com');
    expect(normalizeServerUrl('http://localhost:2583/')).toBe('http://localhost:2583');
  });

  it('rejects input that is not an address', () => {
    expect(() => normalizeServerUrl('not a url')).toThrow();
  });
});

describe('resolveIdentity', () => {
  it('resolves a handle to its DID and PDS through the DID document', async () => {
    await expect(resolveIdentity('alice.wafrn.example')).resolves.toEqual({
      did: DID,
      handle: 'alice.wafrn.example',
      pds: 'https://pds.wafrn.example',
    });
  });

  it('resolves a did:web through its well-known document', async () => {
    await expect(resolveIdentity('did:web:web.example')).resolves.toMatchObject({
      did: 'did:web:web.example',
      pds: 'https://pds.web.example',
    });
  });

  it('fails clearly for an unknown handle', async () => {
    await expect(resolveIdentity('nobody.example')).rejects.toThrow(/nobody\.example/);
  });
});

describe('resolveServer', () => {
  it('uses an explicit server without resolving anything', async () => {
    await expect(resolveServer('alice.wafrn.example', 'pds.other.example')).resolves.toBe('https://pds.other.example');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps bsky.social for its own handles and email logins without a network call', async () => {
    await expect(resolveServer('alice.bsky.social')).resolves.toBe('https://bsky.social');
    await expect(resolveServer('alice@example.com')).resolves.toBe('https://bsky.social');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('finds the PDS of a custom-domain handle', async () => {
    await expect(resolveServer('alice.wafrn.example')).resolves.toBe('https://pds.wafrn.example');
  });

  it('asks for a handle when only an address is given', async () => {
    await expect(resolveServer('https://pds.example')).rejects.toThrow();
  });
});
