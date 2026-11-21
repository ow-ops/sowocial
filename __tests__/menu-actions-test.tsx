import { renderHook } from '@testing-library/react-native';
import type { AppBskyFeedDefs } from '@atproto/api';
import type { mastodon } from 'masto';

import { accountKey } from '@/auth/account-key';
import type { Session } from '@/auth/types';
import { useAccountActions, useStatusActions, type MenuGroup } from '@/components/menu-actions';
import { toPost as toApPost } from '@/model/adapters/ap';
import { toPost as toBskyPost } from '@/model/adapters/bsky';
import type { Post, Relationship } from '@/model/post';

import accountLocal from './fixtures/account-local.json';
import accountRemote from './fixtures/account-remote.json';
import bskyFixtures from './fixtures/bsky.json';
import statusFixture from './fixtures/status.json';

const mockState = {
  session: undefined as Session | undefined,
  sessions: [] as Session[],
  acting: null as string | null,
  canWriteQuotes: false,
  relationship: undefined as Relationship | undefined,
};

jest.mock('masto', () => ({ createRestAPIClient: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showError: jest.fn() }));
jest.mock('expo-router', () => ({ router: { canGoBack: jest.fn(), back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/auth/session', () => ({
  useActingKey: () => mockState.acting,
  useAuthedSession: () => mockState.session,
  useSession: () => ({ session: mockState.session, sessions: mockState.sessions, signOut: jest.fn() }),
}));
jest.mock('@/api/accounts', () => ({
  useAccountModeration: () => ({ mutate: jest.fn() }),
  useBlockDomain: () => ({ mutate: jest.fn() }),
  useRelationship: () => ({ data: mockState.relationship }),
}));
jest.mock('@/api/ap/instance', () => ({ useInstance: () => ({ data: { domain: 'social.example' } }) }));
jest.mock('@/api/ap/profile-extras', () => ({
  useEndorseAccount: () => ({ mutate: jest.fn() }),
  useFollowOptions: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/api/ap/translate', () => ({
  hideTranslation: jest.fn(),
  useCanTranslate: () => false,
  useShownTranslation: () => undefined,
  useTranslatePost: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/api/statuses', () => ({
  useCanWriteQuotes: () => mockState.canWriteQuotes,
  useDeleteStatus: () => ({ mutate: jest.fn() }),
  useRedraftStatus: () => ({ mutate: jest.fn() }),
  useSeedStatus: () => jest.fn(),
  useStatusToggle: () => ({ mutate: jest.fn() }),
}));

const local = accountLocal as unknown as mastodon.v1.Account;
const remote = accountRemote as unknown as mastodon.v1.Account;

const apSession = { protocol: 'ap', instance: 'https://social.example', accountId: local.id } as Session;
const bskySession = { protocol: 'bsky', did: 'did:plc:alice111', accountId: 'did:plc:alice111' } as Session;

const apPost = (extra: Partial<mastodon.v1.Status> = {}): Post =>
  toApPost({ ...statusFixture, account: local, reblog: null, quote: null, ...extra } as unknown as mastodon.v1.Status);
const apPostBy = (account: mastodon.v1.Account) => apPost({ account });
const bskyPost = (): Post => toBskyPost(bskyFixtures.posts.rich as unknown as AppBskyFeedDefs.PostView);

const signIn = (...sessions: Session[]) => Object.assign(mockState, { session: sessions[0], sessions, acting: null });
const keysOf = (groups: MenuGroup[]) => groups.map((g) => g.key);
const items = (groups: MenuGroup[], key: MenuGroup['key']) => groups.find((g) => g.key === key)?.items.map((i) => i.key);

const statusMenu = async (post: Post) => (await renderHook(() => useStatusActions(post))).result.current;
const accountMenu = async (post: Post, options?: { own?: boolean }) =>
  (await renderHook(() => useAccountActions(post.author, options))).result.current;

beforeEach(() => {
  Object.assign(mockState, { canWriteQuotes: false, relationship: undefined });
  signIn(apSession);
});

describe('post menu on the fediverse', () => {
  it('offers an own post edit, pin, redraft and delete', async () => {
    const groups = await statusMenu(apPost({ visibility: 'public' }));
    expect(keysOf(groups)).toEqual(['own', 'post']);
    expect(items(groups, 'own')).toEqual(['edit', 'pin', 'redraft', 'delete']);
  });

  it('does not offer pinning a followers-only post', async () => {
    expect(items(await statusMenu(apPost({ visibility: 'private' })), 'own')).toEqual(['edit', 'redraft', 'delete']);
  });

  it('offers someone else post sharing and moderation, with the thread mute', async () => {
    const groups = await statusMenu(apPostBy(remote));
    expect(keysOf(groups)).toEqual(['post', 'moderation']);
    expect(items(groups, 'post')).toEqual(['muteConversation', 'copyText', 'share', 'quote', 'browser']);
    expect(items(groups, 'moderation')).toEqual(['mute', 'block', 'report', 'blockDomain']);
  });

  it('adds quoting when the server supports it and the post allows it', async () => {
    mockState.canWriteQuotes = true;
    const quotable = apPost({ account: remote, quoteApproval: { currentUser: 'automatic' } } as never);
    expect(items(await statusMenu(quotable), 'post')).toContain('quote');
    expect(items(await statusMenu(apPost({ account: remote, quoteApproval: { currentUser: 'denied' } } as never)), 'post')).not.toContain('quote');
  });

  it('quotes by link when the server has no quote posts, but only public posts', async () => {
    expect(items(await statusMenu(apPost({ account: remote, visibility: 'unlisted' } as never)), 'post')).toContain('quote');
    expect(items(await statusMenu(apPost({ account: remote, visibility: 'private' } as never)), 'post')).not.toContain('quote');
  });
});

describe('post menu on Bluesky', () => {
  beforeEach(() => signIn(bskySession));

  it('offers an own post pin and delete, without edit, redraft or thread mute', async () => {
    const groups = await statusMenu(bskyPost());
    expect(items(groups, 'own')).toEqual(['pin', 'delete']);
    expect(items(groups, 'post')).not.toContain('muteConversation');
  });

  it("offers someone else's post moderation without domain blocking", async () => {
    signIn({ ...bskySession, did: 'did:plc:me', accountId: 'did:plc:me' } as Session);
    const groups = await statusMenu(bskyPost());
    expect(keysOf(groups)).toEqual(['post', 'moderation']);
    expect(items(groups, 'moderation')).toEqual(['mute', 'block', 'report']);
  });
});

describe('post menu for another signed-in account', () => {
  it("limits someone else's post from the other network to sharing", async () => {
    signIn(apSession, { ...bskySession, did: 'did:plc:me', accountId: 'did:plc:me' } as Session);
    const post = { ...bskyPost(), accountKey: accountKey(mockState.sessions[1]) } as Post;
    expect(keysOf(await statusMenu(post))).toEqual(['post']);
  });

  it("keeps delete and pin for the other account's own post but not edit or redraft", async () => {
    signIn(bskySession, apSession);
    const post = { ...apPost({ visibility: 'public' }), accountKey: accountKey(apSession) } as Post;
    const groups = await statusMenu(post);
    expect(items(groups, 'own')).toEqual(['pin', 'delete']);
    expect(items(groups, 'post')).not.toContain('muteConversation');
  });
});

describe('account menu', () => {
  it('has the own-account actions first on your own profile', async () => {
    const groups = await accountMenu(apPost(), { own: true });
    expect(keysOf(groups)).toEqual(['own', 'share']);
    expect(items(groups, 'own')).toEqual(['more', 'settings', 'signOut']);
  });

  it('offers a followed fediverse account list, follow and instance actions', async () => {
    mockState.relationship = { following: true } as Relationship;
    const groups = await accountMenu(apPostBy(remote));
    expect(items(groups, 'account')).toEqual(['browseInstance', 'addToList', 'reblogs', 'notify', 'endorse']);
    expect(items(groups, 'moderation')).toContain('blockDomain');
  });

  it('hides follow options until the account is followed', async () => {
    expect(items(await accountMenu(apPostBy(remote)), 'account')).toEqual(['browseInstance', 'addToList']);
  });

  it('offers a Bluesky account only the list action', async () => {
    signIn(bskySession);
    mockState.relationship = { following: true } as Relationship;
    const groups = await accountMenu(bskyPost());
    expect(items(groups, 'account')).toEqual(['addToList']);
    expect(items(groups, 'moderation')).toEqual(['mute', 'block', 'report']);
  });
});
