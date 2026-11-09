import {
  cleanServices,
  DEFAULT_SERVICES,
  isServiceId,
  resolveServices,
  servicesKey,
  splitService,
} from '@/auth/bsky-services';
import { parseSession } from '@/auth/instance';

describe('isServiceId', () => {
  it('accepts a DID with a service fragment', () => {
    expect(isServiceId('did:web:api.bsky.app#bsky_appview')).toBe(true);
    expect(isServiceId('did:plc:ar7c4by46qjdydhdevvrndac#atproto_labeler')).toBe(true);
    expect(isServiceId('did:web:localhost%3A3000#bsky_chat')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'did:web:api.bsky.app', '#bsky_appview', 'https://api.bsky.app', 'did:key:abc#x', 'did:web:a b#x']) {
      expect(isServiceId(bad)).toBe(false);
    }
  });
});

describe('services', () => {
  it('falls back to Bluesky for missing entries', () => {
    expect(resolveServices({})).toEqual(DEFAULT_SERVICES);
    expect(resolveServices({ services: { chat: 'did:web:chat.example#bsky_chat' } })).toEqual({
      ...DEFAULT_SERVICES,
      chat: 'did:web:chat.example#bsky_chat',
    });
  });

  it('keeps only valid non-default entries', () => {
    expect(
      cleanServices({
        appview: ' did:web:view.example#bsky_appview ',
        chat: DEFAULT_SERVICES.chat,
        moderation: 'nope',
        extra: 'did:web:x#y',
      }),
    ).toEqual({ appview: 'did:web:view.example#bsky_appview' });
    expect(cleanServices({ chat: DEFAULT_SERVICES.chat })).toBeUndefined();
    expect(cleanServices('x')).toBeUndefined();
  });

  it('splits a service into DID and type and keys on the resolved set', () => {
    expect(splitService('did:web:api.bsky.chat#bsky_chat')).toEqual({ did: 'did:web:api.bsky.chat', type: 'bsky_chat' });
    expect(servicesKey({})).toBe(servicesKey({ services: { appview: DEFAULT_SERVICES.appview } }));
    expect(servicesKey({})).not.toBe(servicesKey({ services: { appview: 'did:web:v.example#bsky_appview' } }));
  });
});

describe('session migration', () => {
  const stored = {
    protocol: 'bsky',
    did: 'did:plc:abcdefghijklmnopqrstuvwx',
    handle: 'alice.bsky.social',
    pds: 'https://bsky.social',
    auth: 'oauth',
    accountId: 'did:plc:abcdefghijklmnopqrstuvwx',
    acct: 'alice.bsky.social',
  };

  it('loads a Bluesky session saved before services existed with the defaults', () => {
    const session = parseSession(stored);
    expect(session).toMatchObject(stored);
    expect(session && session.protocol === 'bsky' && resolveServices(session)).toEqual(DEFAULT_SERVICES);
  });

  it('drops invalid stored services and keeps valid ones', () => {
    const session = parseSession({ ...stored, services: { appview: 'bad', chat: 'did:web:chat.example#bsky_chat' } });
    expect(session && session.protocol === 'bsky' && session.services).toEqual({ chat: 'did:web:chat.example#bsky_chat' });
  });
});
