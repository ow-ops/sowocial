import { discoverInstance, isSession, normalizeInstance, parseSession } from '@/auth/instance';

describe('normalizeInstance', () => {
  it('adds https and strips paths', () => {
    expect(normalizeInstance('gts.example.org')).toBe('https://gts.example.org');
    expect(normalizeInstance(' https://GTS.example.org/@me?x=1 ')).toBe('https://gts.example.org');
  });

  it('keeps an explicit http scheme and port', () => {
    expect(normalizeInstance('http://localhost:8080/')).toBe('http://localhost:8080');
  });

  it('rejects empty input', () => {
    expect(() => normalizeInstance('   ')).toThrow('Enter a server address');
  });
});

describe('isSession', () => {
  it('accepts a complete session', () => {
    expect(isSession({ instance: 'https://a.b', token: 't', accountId: '1' })).toBe(true);
  });

  it('rejects partial or malformed values', () => {
    expect(isSession(null)).toBe(false);
    expect(isSession({ instance: 'https://a.b', token: 't' })).toBe(false);
    expect(isSession('session')).toBe(false);
  });
});

describe('parseSession', () => {
  it('treats a session without a protocol as a fediverse session', () => {
    expect(parseSession({ instance: 'https://a.b', token: 't', accountId: '1' })).toEqual({
      protocol: 'ap',
      instance: 'https://a.b',
      token: 't',
      accountId: '1',
    });
  });

  it('accepts a Bluesky session', () => {
    const session = {
      protocol: 'bsky',
      did: 'did:plc:a',
      handle: 'a.bsky.social',
      pds: 'https://pds.example',
      auth: 'oauth',
      accountId: 'did:plc:a',
      acct: 'a.bsky.social',
    };
    expect(parseSession(session)).toEqual(session);
  });

  it('rejects a Bluesky session missing its auth kind', () => {
    expect(parseSession({ protocol: 'bsky', did: 'did:plc:a', handle: 'a', pds: 'https://p', accountId: 'x' })).toBeNull();
    expect(parseSession(null)).toBeNull();
  });
});

describe('discoverInstance', () => {
  const respond = (routes: Record<string, string>) =>
    jest.fn(async (url: string) =>
      url in routes
        ? ({ ok: true, text: async () => routes[url] } as Response)
        : ({ ok: false, text: async () => '' } as Response),
    ) as unknown as typeof fetch;

  it('follows nodeinfo from a handle domain to the instance host', async () => {
    const fetchFn = respond({
      'https://example.dev/.well-known/nodeinfo': JSON.stringify({
        links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: 'https://gts.example.dev/nodeinfo/2.0' }],
      }),
    });
    await expect(discoverInstance('example.dev', fetchFn)).resolves.toBe('https://gts.example.dev');
  });

  it('takes the domain from a full handle', async () => {
    const fetchFn = respond({
      'https://example.dev/.well-known/nodeinfo': JSON.stringify({ links: [{ href: 'https://gts.example.dev/nodeinfo/2.1' }] }),
    });
    await expect(discoverInstance('@me@example.dev', fetchFn)).resolves.toBe('https://gts.example.dev');
  });

  it('falls back to the host-meta webfinger template', async () => {
    const fetchFn = respond({
      'https://example.dev/.well-known/host-meta':
        '<XRD><Link rel="lrdd" type="application/xrd+xml" template="https://social.example.dev/.well-known/webfinger?resource={uri}"/></XRD>',
    });
    await expect(discoverInstance('example.dev', fetchFn)).resolves.toBe('https://social.example.dev');
  });

  it('keeps an instance that describes itself', async () => {
    const fetchFn = respond({
      'https://gts.example.dev/.well-known/nodeinfo': JSON.stringify({ links: [{ href: 'https://gts.example.dev/nodeinfo/2.0' }] }),
    });
    await expect(discoverInstance('https://gts.example.dev/@me', fetchFn)).resolves.toBe('https://gts.example.dev');
  });

  it('falls back to the typed server when discovery fails', async () => {
    await expect(discoverInstance('gts.example.dev', respond({}))).resolves.toBe('https://gts.example.dev');
  });
});
