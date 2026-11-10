import type { Agent } from '@atproto/api';

import { createBskyBackend } from '@/api/bsky/backend';
import { bskyBookmarksPage, bskySetBookmark } from '@/api/bsky/bookmarks';
import { bskyCreateList, bskyDeleteList, bskyListMembers, bskyListTimelinePage, bskyLists, bskyRenameList, bskySetListMember, listId, listUri } from '@/api/bsky/lists';
import { bskySetPinned, bskyUpdateProfile } from '@/api/bsky/profile-edit';
import { bskySuggestedFollows } from '@/api/bsky/suggestions';
import { isScopeMissing } from '@/auth/bsky-errors';
import { capabilitiesFor } from '@/api/backend/capabilities';
import type { BskySession } from '@/auth/types';
import { bskyPost } from './fixtures/bsky-agent';

jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));

const ME = 'did:plc:me';
const profile = (did: string) => ({ did, handle: `${did.slice(8)}.test` });
const view = bskyPost().raw!.bsky;

describe('scope errors', () => {
  it('recognises the PDS refusing a call for a missing scope', () => {
    expect(isScopeMissing(403, { error: 'ScopeMissingError', message: 'Missing required scope "rpc:app.bsky.graph.getLists?aud=*"' })).toBe(true);
    expect(isScopeMissing(403, { message: 'Missing required scope "repo:app.bsky.graph.list?action=create"' })).toBe(true);
  });

  it('ignores other failures', () => {
    expect(isScopeMissing(403, { error: 'Forbidden', message: 'nope' })).toBe(false);
    expect(isScopeMissing(401, { error: 'ScopeMissingError' })).toBe(false);
    expect(isScopeMissing(403, null)).toBe(false);
  });
});

describe('capabilities', () => {
  it('turns on the features that now have scopes and hides the fediverse-only ones', () => {
    expect(capabilitiesFor('bsky')).toMatchObject({
      lists: true,
      bookmarks: true,
      editProfile: true,
      pinnedPosts: true,
      suggestedFollows: true,
      listSettings: false,
      profileFields: false,
      favourites: false,
    });
  });
});

describe('lists', () => {
  const uri = `at://${ME}/app.bsky.graph.list/abc`;

  it('round-trips a list id', () => {
    expect(listId(uri)).toBe(`${ME}@abc`);
    expect(listUri(`${ME}@abc`)).toBe(uri);
  });

  it('pages through curation lists only', async () => {
    const getLists = jest
      .fn()
      .mockResolvedValueOnce({ data: { lists: [{ uri, name: 'One' }], cursor: 'c' } })
      .mockResolvedValueOnce({ data: { lists: [{ uri: `${uri}2`, name: 'Two' }] } });
    const agent = { assertDid: ME, app: { bsky: { graph: { getLists } } } } as unknown as Agent;
    expect(await bskyLists(agent)).toEqual([
      { id: `${ME}@abc`, title: 'One' },
      { id: `${ME}@abc2`, title: 'Two' },
    ]);
    expect(getLists).toHaveBeenCalledWith(expect.objectContaining({ actor: ME, purposes: ['app.bsky.graph.defs#curatelist'] }));
  });

  it('loads the timeline and stores the cursor on the last post', async () => {
    const getListFeed = jest.fn(async () => ({ data: { feed: [{ post: view }], cursor: 'next' } }));
    const agent = { app: { bsky: { feed: { getListFeed } } } } as unknown as Agent;
    const page = await bskyListTimelinePage(agent, `${ME}@abc`);
    expect(getListFeed).toHaveBeenCalledWith(expect.objectContaining({ list: uri }));
    expect(page.at(-1)?.cursor).toBe('next');
  });

  it('creates a curation list', async () => {
    const create = jest.fn(async () => ({ uri }));
    const agent = { assertDid: ME, app: { bsky: { graph: { list: { create } } } } } as unknown as Agent;
    expect(await bskyCreateList(agent, { title: 'Friends' })).toEqual({ id: `${ME}@abc`, title: 'Friends' });
    expect(create).toHaveBeenCalledWith({ repo: ME }, expect.objectContaining({ name: 'Friends', purpose: 'app.bsky.graph.defs#curatelist' }));
  });

  it('renames while keeping the rest of the record', async () => {
    const get = jest.fn(async () => ({ value: { name: 'Old', purpose: 'x', description: 'keep', createdAt: 't' } }));
    const put = jest.fn(async () => ({}));
    const agent = { assertDid: ME, app: { bsky: { graph: { list: { get, put } } } } } as unknown as Agent;
    await bskyRenameList(agent, `${ME}@abc`, { title: 'New' });
    expect(put).toHaveBeenCalledWith({ repo: ME, rkey: 'abc' }, { name: 'New', purpose: 'x', description: 'keep', createdAt: 't' });
  });

  it('deletes a list', async () => {
    const del = jest.fn(async () => undefined);
    const agent = { assertDid: ME, app: { bsky: { graph: { list: { delete: del } } } } } as unknown as Agent;
    await bskyDeleteList(agent, `${ME}@abc`);
    expect(del).toHaveBeenCalledWith({ repo: ME, rkey: 'abc' });
  });

  it('lists members and removes one by its listitem record', async () => {
    const getList = jest.fn(async () => ({
      data: { list: {}, items: [{ uri: `at://${ME}/app.bsky.graph.listitem/i1`, subject: profile('did:plc:a') }, { uri: `at://${ME}/app.bsky.graph.listitem/i2`, subject: profile('did:plc:b') }] },
    }));
    const create = jest.fn(async () => ({}));
    const del = jest.fn(async () => undefined);
    const agent = { assertDid: ME, app: { bsky: { graph: { getList, listitem: { create, delete: del } } } } } as unknown as Agent;
    expect((await bskyListMembers(agent, `${ME}@abc`)).map((a) => a.id)).toEqual(['did:plc:a', 'did:plc:b']);
    await bskySetListMember(agent, `${ME}@abc`, 'did:plc:b', false);
    expect(del).toHaveBeenCalledWith({ repo: ME, rkey: 'i2' });
    await bskySetListMember(agent, `${ME}@abc`, 'did:plc:c', true);
    expect(create).toHaveBeenCalledWith({ repo: ME }, expect.objectContaining({ subject: 'did:plc:c', list: uri }));
  });
});

describe('bookmarks', () => {
  it('creates and deletes through the bookmark endpoints', async () => {
    const createBookmark = jest.fn(async () => ({}));
    const deleteBookmark = jest.fn(async () => ({}));
    const agent = { app: { bsky: { bookmark: { createBookmark, deleteBookmark } } } } as unknown as Agent;
    await bskySetBookmark(agent, { uri: view.uri, cid: view.cid }, true);
    await bskySetBookmark(agent, { uri: view.uri, cid: view.cid }, false);
    expect(createBookmark).toHaveBeenCalledWith({ uri: view.uri, cid: view.cid });
    expect(deleteBookmark).toHaveBeenCalledWith({ uri: view.uri });
  });

  it('lists bookmarked posts, skipping ones that are gone', async () => {
    const getBookmarks = jest.fn(async () => ({
      data: {
        bookmarks: [
          { subject: { uri: view.uri, cid: view.cid }, item: { $type: 'app.bsky.feed.defs#postView', ...view } },
          { subject: { uri: 'x', cid: 'y' }, item: { $type: 'app.bsky.feed.defs#notFoundPost', uri: 'x', notFound: true } },
        ],
        cursor: 'n',
      },
    }));
    const agent = { app: { bsky: { bookmark: { getBookmarks } } } } as unknown as Agent;
    const page = await bskyBookmarksPage(agent);
    expect(page).toHaveLength(1);
    expect(page[0].cursor).toBe('n');
  });

  it('maps bookmark state onto the post', () => {
    expect(bskyPost({ viewer: { bookmarked: true } }).viewer.bookmarked).toBe(true);
    expect(bskyPost().viewer.bookmarked).toBe(false);
    expect(bskyPost().capabilities).toMatchObject({ bookmark: true, pin: true });
  });
});

describe('profile', () => {
  const upsert = (existing: object | undefined) => {
    const upsertProfile = jest.fn(async (fn: (e: object | undefined) => unknown) => {
      saved = await fn(existing);
    });
    let saved: unknown;
    return { agent: { upsertProfile } as unknown as Agent, saved: () => saved };
  };

  it('keeps unrelated fields when editing', async () => {
    const { agent, saved } = upsert({ displayName: 'Old', pinnedPost: { uri: 'u', cid: 'c' }, pronouns: 'she/her' });
    await bskyUpdateProfile(agent, { displayName: 'New', note: 'Bio', locked: false, bot: false, fields: [] });
    expect(saved()).toEqual({ displayName: 'New', description: 'Bio', pinnedPost: { uri: 'u', cid: 'c' }, pronouns: 'she/her' });
  });

  it('rejects an over-long name before touching the record', async () => {
    const { agent } = upsert({});
    await expect(bskyUpdateProfile(agent, { displayName: 'x'.repeat(65), note: '', locked: false, bot: false, fields: [] })).rejects.toThrow();
    expect((agent as unknown as { upsertProfile: jest.Mock }).upsertProfile).not.toHaveBeenCalled();
  });

  it('pins and unpins a post', async () => {
    const pinned = upsert({ displayName: 'Me' });
    await bskySetPinned(pinned.agent, { uri: view.uri, cid: view.cid }, true);
    expect(pinned.saved()).toEqual({ displayName: 'Me', pinnedPost: { uri: view.uri, cid: view.cid } });
    const unpinned = upsert({ displayName: 'Me', pinnedPost: { uri: view.uri, cid: view.cid } });
    await bskySetPinned(unpinned.agent, { uri: view.uri, cid: view.cid }, false);
    expect(unpinned.saved()).toEqual({ displayName: 'Me' });
  });
});

describe('suggestions', () => {
  it('maps suggested actors to authors', async () => {
    const getSuggestions = jest.fn(async () => ({ data: { actors: [profile('did:plc:s')] } }));
    const agent = { app: { bsky: { actor: { getSuggestions } } } } as unknown as Agent;
    expect((await bskySuggestedFollows(agent)).map((a) => a.id)).toEqual(['did:plc:s']);
  });
});

describe('backend', () => {
  it('routes the bookmark action to the bookmark endpoint and leaves the post as is', async () => {
    const createBookmark = jest.fn(async () => ({}));
    const agent = { app: { bsky: { bookmark: { createBookmark } } } } as unknown as Agent;
    const backend = createBskyBackend({ protocol: 'bsky', did: ME, handle: 'me.test', pds: 'https://pds', auth: 'oauth', accountId: ME, acct: 'me.test' } as BskySession, agent);
    const post = bskyPost();
    const update = await backend.postAction(post, 'bookmark', true);
    expect(createBookmark).toHaveBeenCalledWith({ uri: post.uri, cid: post.cid });
    expect(update(post)).toBe(post);
  });
});
