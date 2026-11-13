import type { Agent } from '@atproto/api';

import { bskyCreateList, bskyListMemberPages, bskyModListSubscriptions, bskyResolveUrl, bskySetModListSubscription } from '@/api/bsky/lists';

const ME = 'did:plc:me';
const OWNER = 'did:plc:owner';
const uri = `at://${OWNER}/app.bsky.graph.list/mods`;
const creator = { did: OWNER, handle: 'owner.test' };

const modList = { uri, name: 'Trolls', purpose: 'app.bsky.graph.defs#modlist', creator, viewer: { muted: true, blocked: 'at://me/app.bsky.graph.listblock/x' } };

describe('moderation lists', () => {
  it('reads muted lists page by page', async () => {
    const getListMutes = jest
      .fn()
      .mockResolvedValueOnce({ data: { lists: [modList], cursor: 'c' } })
      .mockResolvedValueOnce({ data: { lists: [{ ...modList, uri: `${uri}2`, name: 'Two' }] } });
    const agent = { app: { bsky: { graph: { getListMutes } } } } as unknown as Agent;
    const lists = await bskyModListSubscriptions(agent, 'mute');
    expect(lists).toEqual([
      expect.objectContaining({ id: `${OWNER}@mods`, title: 'Trolls', purpose: 'mod', subscription: { muted: true, blocked: true } }),
      expect.objectContaining({ id: `${OWNER}@mods2`, title: 'Two' }),
    ]);
    expect(getListMutes).toHaveBeenCalledTimes(2);
  });

  it('reads blocked lists', async () => {
    const getListBlocks = jest.fn(async () => ({ data: { lists: [modList] } }));
    const agent = { app: { bsky: { graph: { getListBlocks } } } } as unknown as Agent;
    expect(await bskyModListSubscriptions(agent, 'block')).toHaveLength(1);
    expect(getListBlocks).toHaveBeenCalled();
  });

  it('mutes and unmutes a list by its at-uri', async () => {
    const muteModList = jest.fn(async () => ({ success: true, headers: {} }));
    const unmuteModList = jest.fn(async () => ({ success: true, headers: {} }));
    const agent = { muteModList, unmuteModList } as unknown as Agent;
    await bskySetModListSubscription(agent, `${OWNER}@mods`, 'mute', true);
    await bskySetModListSubscription(agent, `${OWNER}@mods`, 'mute', false);
    expect(muteModList).toHaveBeenCalledWith(uri);
    expect(unmuteModList).toHaveBeenCalledWith(uri);
  });

  it('blocks and unblocks a list by its at-uri', async () => {
    const blockModList = jest.fn(async () => ({ uri: 'at://me/app.bsky.graph.listblock/x', cid: 'c' }));
    const unblockModList = jest.fn(async () => undefined);
    const agent = { blockModList, unblockModList } as unknown as Agent;
    await bskySetModListSubscription(agent, `${OWNER}@mods`, 'block', true);
    await bskySetModListSubscription(agent, `${OWNER}@mods`, 'block', false);
    expect(blockModList).toHaveBeenCalledWith(uri);
    expect(unblockModList).toHaveBeenCalledWith(uri);
  });

  it('creates a moderation list when asked for one', async () => {
    const create = jest.fn(async () => ({ uri }));
    const agent = { assertDid: ME, app: { bsky: { graph: { list: { create } } } } } as unknown as Agent;
    expect(await bskyCreateList(agent, { title: 'Trolls', purpose: 'mod' })).toEqual({ id: `${OWNER}@mods`, title: 'Trolls', purpose: 'mod' });
    expect(create).toHaveBeenCalledWith({ repo: ME }, expect.objectContaining({ name: 'Trolls', purpose: 'app.bsky.graph.defs#modlist' }));
  });
});

describe('bsky.app list links', () => {
  it('resolves a list link to the list id, looking up the handle', async () => {
    const resolveHandle = jest.fn(async () => ({ data: { did: OWNER } }));
    const agent = { com: { atproto: { identity: { resolveHandle } } } } as unknown as Agent;
    expect(await bskyResolveUrl(agent, 'https://bsky.app/profile/owner.test/lists/3kabc')).toEqual({ type: 'list', id: `${OWNER}@3kabc` });
    expect(resolveHandle).toHaveBeenCalledWith({ handle: 'owner.test' });
  });

  it('resolves a starter pack link by DID without a lookup', async () => {
    expect(await bskyResolveUrl({} as Agent, `https://bsky.app/starter-pack/${OWNER}/3kabc`)).toEqual({ type: 'starterPack', id: `${OWNER}@3kabc` });
  });

  it('does not resolve other links', async () => {
    const agent = {} as Agent;
    expect(await bskyResolveUrl(agent, 'https://bsky.app/profile/owner.test')).toBeNull();
    expect(await bskyResolveUrl(agent, 'https://bsky.app/profile/owner.test/post/3kabc')).toBeNull();
  });
});

describe('moderation list members', () => {
  const item = (did: string) => ({ uri: `at://${OWNER}/app.bsky.graph.listitem/${did}`, subject: { did, handle: `${did}.test` } });

  it('yields one page per request and follows the cursor', async () => {
    const getList = jest
      .fn()
      .mockResolvedValueOnce({ data: { items: [item('a'), item('b')], cursor: 'next' } })
      .mockResolvedValueOnce({ data: { items: [item('c')] } });
    const agent = { app: { bsky: { graph: { getList } } } } as unknown as Agent;
    const pages: string[][] = [];
    for await (const page of bskyListMemberPages(agent, `${OWNER}@mods`)) pages.push(page.map((a) => a.id));
    expect(pages).toEqual([['a', 'b'], ['c']]);
    expect(getList).toHaveBeenNthCalledWith(1, expect.objectContaining({ list: uri, cursor: undefined }));
    expect(getList).toHaveBeenNthCalledWith(2, expect.objectContaining({ list: uri, cursor: 'next' }));
  });

  it('does not read further pages until asked', async () => {
    const getList = jest.fn(async () => ({ data: { items: [item('a')], cursor: 'next' } }));
    const agent = { app: { bsky: { graph: { getList } } } } as unknown as Agent;
    const pages = bskyListMemberPages(agent, `${OWNER}@mods`);
    await pages.next();
    expect(getList).toHaveBeenCalledTimes(1);
  });
});
