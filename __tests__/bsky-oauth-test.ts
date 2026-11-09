import { describeBskyError, isNetworkFailure, isOAuthCancelled, isSelfHosted } from '@/auth/bsky-errors';
import {
  buildLoopbackClientId,
  loopbackIpHref,
  nativeClientMetadata,
  oauthAvailable,
  oauthClientId,
  PRODUCTION_ORIGIN,
  webClientMetadata,
} from '@/auth/bsky-oauth-config';
import en from '@/i18n/locales/en/auth.json';

const where = (url: string) => {
  const { origin, hostname, port } = new URL(url);
  return { origin, hostname, port };
};

describe('oauth client metadata', () => {
  it('keeps scopes identical and matches each client_id to its document', () => {
    expect(webClientMetadata.scope).toBe(nativeClientMetadata.scope);
    expect(webClientMetadata.client_id).toBe(`${PRODUCTION_ORIGIN}/oauth-client-metadata-web.json`);
    expect(webClientMetadata.application_type).toBe('web');
    expect(webClientMetadata.redirect_uris).toEqual([`${PRODUCTION_ORIGIN}/oauth/callback`]);
    expect(nativeClientMetadata.application_type).toBe('native');
  });
});

describe('client_id selection', () => {
  it('uses the native document on iOS and Android', () => {
    expect(oauthClientId('ios')).toBe(nativeClientMetadata.client_id);
    expect(oauthClientId('android', where('https://elsewhere.example'))).toBe(nativeClientMetadata.client_id);
  });

  it('uses the web document on the production origin', () => {
    expect(oauthClientId('web', where(`${PRODUCTION_ORIGIN}/login`))).toBe(webClientMetadata.client_id);
  });

  it('uses a loopback client on localhost and 127.0.0.1', () => {
    for (const url of ['http://localhost:8081/', 'http://127.0.0.1:8081/login']) {
      expect(oauthClientId('web', where(url))).toBe(buildLoopbackClientId({ port: '8081' }));
    }
  });

  it('has no OAuth on other web origins', () => {
    expect(oauthClientId('web', where('https://preview.example.com'))).toBeNull();
    expect(oauthClientId('web')).toBeNull();
    expect(oauthAvailable('web', where('https://preview.example.com'))).toBe(false);
    expect(oauthAvailable('web', where(PRODUCTION_ORIGIN))).toBe(true);
  });
});

describe('loopback client_id', () => {
  const url = new URL(buildLoopbackClientId({ port: '8081' }));

  it('is an http://localhost client with no port or path', () => {
    expect(url.origin).toBe('http://localhost');
    expect(url.pathname).toBe('/');
    expect(url.hash).toBe('');
  });

  it('declares a 127.0.0.1 redirect and the full scope', () => {
    expect(url.searchParams.getAll('redirect_uri')).toEqual(['http://127.0.0.1:8081/oauth/callback']);
    expect(url.searchParams.get('scope')).toBe(nativeClientMetadata.scope);
    expect(url.searchParams.get('scope')?.split(' ')).toContain('atproto');
  });

  it('omits the port when there is none', () => {
    expect(new URL(buildLoopbackClientId({ port: '' })).searchParams.get('redirect_uri')).toBe('http://127.0.0.1/oauth/callback');
  });

  it('moves localhost to the loopback IP only', () => {
    const at = (href: string) => ({ ...where(href), href });
    expect(loopbackIpHref(at('http://localhost:8081/login?x=1'))).toBe('http://127.0.0.1:8081/login?x=1');
    expect(loopbackIpHref(at('http://127.0.0.1:8081/'))).toBeNull();
    expect(loopbackIpHref(at(`${PRODUCTION_ORIGIN}/`))).toBeNull();
  });
});

const xrpc = (status: number, error: string) => Object.assign(new Error(error), { status, error });

describe('describeBskyError', () => {
  const bad = en.errors.wrongPassword;
  const message = (error: unknown, server: string, oauth = false) => describeBskyError(error, { server, oauth }).message;

  it('maps cocoon and PDS login failures to a wrong password', () => {
    expect(message(xrpc(400, 'InvalidRequest'), 'https://bsky.social')).toBe(bad);
    expect(message(xrpc(401, 'AuthenticationRequired'), 'https://bsky.network')).toBe(bad);
    expect(message(xrpc(401, 'Whatever'), 'https://bsky.social')).toBe(bad);
  });

  it('adds the app password hint on self-hosted servers', () => {
    expect(message(xrpc(400, 'InvalidRequest'), 'https://pds.example.com')).toBe(en.errors.wrongPasswordSelfHosted);
  });

  it('maps network and CORS failures to an unreachable server', () => {
    const expected = en.errors.unreachable.replace('{{server}}', 'https://pds.example.com');
    expect(message(new TypeError('Failed to fetch'), 'https://pds.example.com')).toBe(expected);
    expect(message(new TypeError('fetch failed'), 'https://pds.example.com')).toBe(expected);
    expect(message(xrpc(1, 'Unknown'), 'https://pds.example.com')).toBe(expected);
    expect(message(Object.assign(new Error('x'), { status: 0 }), 'https://pds.example.com')).toBe(expected);
    expect(message(new Error('wrapped', { cause: new TypeError('Network request failed') }), 'https://pds.example.com')).toBe(expected);
  });

  it('keeps unrelated errors untouched', () => {
    const error = new Error('Could not find the server for alice');
    expect(describeBskyError(error, { server: 'https://pds.example.com' })).toBe(error);
    expect(message(xrpc(500, 'InternalServerError'), 'https://pds.example.com')).toBe('InternalServerError');
  });

  it('maps OAuth failures', () => {
    const params = (code: string) => Object.assign(new Error('cb'), { params: new URLSearchParams({ error: code }) });
    expect(message(params('access_denied'), 'alice.test', true)).toBe(en.errors.cancelled);
    expect(message(Object.assign(new Error('x'), { error: 'invalid_client' }), 'alice.test', true)).toBe(en.errors.clientRejected);
    expect(message(Object.assign(new Error('x'), { error: 'invalid_scope' }), 'alice.test', true)).toBe(en.errors.scopeRejected);
    expect(message(params('invalid_scope'), 'alice.test', true)).toBe(en.errors.scopeRejected);
    expect(message(new TypeError('Failed to fetch'), 'alice.test', true)).toBe(
      en.errors.unreachableOauth.replace('{{server}}', 'alice.test'),
    );
    expect(message(new TypeError('Failed to fetch'), '', true)).toBe(en.errors.unreachableGeneric);
  });

  it('detects cancellation through the cause chain and native messages', () => {
    expect(isOAuthCancelled(new Error('User cancelled'))).toBe(true);
    expect(isOAuthCancelled(describeBskyError(new Error('User cancelled'), { server: 'x', oauth: true }))).toBe(true);
    expect(isOAuthCancelled(new Error('boom'))).toBe(false);
    expect(isNetworkFailure(new Error('boom'))).toBe(false);
  });

  it('tells Bluesky-hosted servers from self-hosted ones', () => {
    expect(isSelfHosted('https://bsky.social')).toBe(false);
    expect(isSelfHosted('https://morel.us-east.host.bsky.network')).toBe(false);
    expect(isSelfHosted('pds.example.com')).toBe(true);
  });
});
