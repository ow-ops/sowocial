import { scanFollows, settleFollows } from '@/api/cross-network';
import type { RichContent } from '@/model/content';
import type { Author } from '@/model/post';
import { getBackend } from '@/api/backend';
import { chunked } from '@/utils/chunked';
import { crossNetworkIdentity, identityUrl } from '@/utils/cross-network';

jest.mock('@/auth/session', () => ({ accountKey: jest.fn() }));
jest.mock('@/api/backend', () => ({ getBackend: jest.fn() }));

const author = (protocol: 'ap' | 'bsky', handle: string, extra: Partial<Author> = {}) =>
  ({ protocol, handle, id: handle, uid: handle, url: '', ...extra }) as unknown as Author;

const html = (value: string): RichContent => ({ kind: 'html', html: value, emojis: [] });
const segments = (...items: { type: 'text' | 'link'; text: string; url?: string }[]): RichContent => ({
  kind: 'segments',
  segments: items.map((s) => (s.type === 'link' ? { type: 'link', text: s.text, url: s.url! } : { type: 'text', text: s.text })),
});

describe('cross-network identity', () => {
  it('reads the fediverse identity of a Bluesky account bridged from the fediverse', () => {
    expect(crossNetworkIdentity(author('bsky', 'snarfed.indieweb.social.ap.brid.gy'))).toEqual({
      protocol: 'ap',
      handle: 'snarfed@indieweb.social',
    });
  });

  it('reads the Bluesky identity of a fediverse account bridged from Bluesky', () => {
    expect(crossNetworkIdentity(author('ap', 'alice.bsky.social@bsky.brid.gy'))).toEqual({
      protocol: 'bsky',
      handle: 'alice.bsky.social',
    });
  });

  it('finds a Bluesky profile link in a fediverse profile field', () => {
    const profile = author('ap', 'bob@example.social', {
      fields: [{ name: 'Bluesky', value: html('<a href="https://bsky.app/profile/bob.bsky.social" rel="me">bob</a>') }],
    });
    expect(crossNetworkIdentity(profile)).toEqual({ protocol: 'bsky', handle: 'bob.bsky.social' });
  });

  it('finds a Bluesky profile link in a fediverse bio', () => {
    const profile = author('ap', 'bob@example.social', {
      note: html('<p>Also at <a href="https://bsky.app/profile/bob.example.com">bsky</a></p>'),
    });
    expect(crossNetworkIdentity(profile)).toEqual({ protocol: 'bsky', handle: 'bob.example.com' });
  });

  it('ignores a Bluesky post link, which is not a profile', () => {
    const profile = author('ap', 'bob@example.social', {
      note: html('<a href="https://bsky.app/profile/bob.bsky.social/post/3abc">post</a>'),
    });
    expect(crossNetworkIdentity(profile)).toBeNull();
  });

  it('finds a fediverse profile link in a Bluesky bio', () => {
    const profile = author('bsky', 'carol.bsky.social', {
      note: segments({ type: 'link', text: 'mastodon', url: 'https://example.social/@carol' }),
    });
    expect(crossNetworkIdentity(profile)).toEqual({ protocol: 'ap', handle: 'carol@example.social' });
  });

  it('finds a fediverse handle written in a Bluesky bio', () => {
    const profile = author('bsky', 'carol.bsky.social', {
      note: segments({ type: 'text', text: 'Find me at @carol@example.social today' }),
    });
    expect(crossNetworkIdentity(profile)).toEqual({ protocol: 'ap', handle: 'carol@example.social' });
  });

  it('returns null for two different people with no declared identity', () => {
    expect(crossNetworkIdentity(author('ap', 'dave@example.social', { note: html('<p>hello</p>') }))).toBeNull();
    expect(crossNetworkIdentity(author('bsky', 'erin.bsky.social'))).toBeNull();
  });

  it('builds the profile URL of each identity', () => {
    expect(identityUrl({ protocol: 'bsky', handle: 'alice.bsky.social' })).toBe('https://bsky.app/profile/alice.bsky.social');
    expect(identityUrl({ protocol: 'ap', handle: 'snarfed@indieweb.social' })).toBe('https://indieweb.social/@snarfed');
  });
});

describe('chunked', () => {
  it('splits into batches of five', () => {
    expect(chunked(Array.from({ length: 12 }, (_, i) => i)).map((c) => c.length)).toEqual([5, 5, 2]);
  });
});

describe('settling bulk follows', () => {
  const targets = [author('bsky', 'a'), author('bsky', 'b'), author('bsky', 'c')];

  it('keeps the accounts whose follow failed so they can be retried', () => {
    const boom = new Error('rate limited');
    const outcome = settleFollows(targets, [
      { status: 'fulfilled', value: undefined },
      { status: 'rejected', reason: boom },
      { status: 'rejected', reason: new Error('later') },
    ]);
    expect(outcome.followed).toEqual(['a']);
    expect(outcome.failed.map((a) => a.id)).toEqual(['b', 'c']);
    expect(outcome.firstError).toBe(boom);
  });

  it('reports no failures when every follow went through', () => {
    const outcome = settleFollows(targets.slice(0, 1), [{ status: 'fulfilled', value: undefined }]);
    expect(outcome).toEqual({ followed: ['a'], failed: [] });
  });
});

describe('scanning follows', () => {
  const session = (protocol: 'ap' | 'bsky') => ({ protocol, accountId: protocol }) as never;
  const bridged = (n: number) => author('ap', `user${n}.bsky.social@bsky.brid.gy`);

  it('stops between chunks once aborted, without further lookups', async () => {
    const findByHandle = jest.fn(async () => null);
    const relationship = jest.fn();
    const follows = async function* () {
      yield Array.from({ length: 12 }, (_, i) => bridged(i));
    };
    jest.mocked(getBackend).mockReturnValue({ follows, findByHandle, relationship } as never);
    const controller = new AbortController();

    const scan = scanFollows(session('ap'), session('bsky'), ({ checked }) => checked === 5 && controller.abort(), controller.signal);

    await expect(scan).rejects.toMatchObject({ name: 'AbortError' });
    expect(findByHandle).toHaveBeenCalledTimes(5);
  });

  it('reads no follows when aborted beforehand', async () => {
    const follows = jest.fn(async function* () {
      yield [bridged(1)];
    });
    jest.mocked(getBackend).mockReturnValue({ follows } as never);
    const controller = new AbortController();
    controller.abort();

    await expect(scanFollows(session('ap'), session('bsky'), jest.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
