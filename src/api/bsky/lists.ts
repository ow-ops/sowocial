import { AtUri, type Agent, type AppBskyGraphDefs } from '@atproto/api';

import { toAuthor, toPage } from '@/model/adapters/bsky';
import type { Author, Post } from '@/model/post';
import { bskyRecordLink } from '@/utils/links';

import type { ListSettings, ModListKind, UserList } from '../backend/types';
import { PAGE_SIZE } from '../pagination';

const LIST_COLLECTION = 'app.bsky.graph.list';
const CURATE_LIST = 'app.bsky.graph.defs#curatelist';
const MOD_LIST = 'app.bsky.graph.defs#modlist';
const PER_REQUEST = 100;

// A record is identified as `did@rkey`; the collection is implied by where the id is used.
export const listId = (uri: string) => {
  const { hostname, rkey } = new AtUri(uri);
  return `${hostname}@${rkey}`;
};

export const recordUri = (id: string, collection: string) => {
  const at = id.indexOf('@');
  return `at://${id.slice(0, at)}/${collection}/${id.slice(at + 1)}`;
};

export const listUri = (id: string) => recordUri(id, LIST_COLLECTION);

const rkeyOf = (id: string) => id.slice(id.indexOf('@') + 1);

const purposeOf = (purpose: string) => (purpose === MOD_LIST ? 'mod' : 'curate');

// What the moderation-list screen shows beyond the lists both networks have.
export type ModList = UserList & {
  description?: string;
  creator: Author;
  subscription: { muted: boolean; blocked: boolean };
};

const toList = (view: AppBskyGraphDefs.ListView): UserList => ({
  id: listId(view.uri),
  title: view.name,
  purpose: purposeOf(view.purpose),
});

const toModList = (view: AppBskyGraphDefs.ListView): ModList => ({
  ...toList(view),
  description: view.description,
  creator: toAuthor(view.creator),
  subscription: { muted: !!view.viewer?.muted, blocked: !!view.viewer?.blocked },
});

async function drain<T>(fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; cursor?: string }>) {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

export const bskyLists = (agent: Agent): Promise<UserList[]> =>
  drain(async (cursor) => {
    const { data } = await agent.app.bsky.graph.getLists({
      actor: agent.assertDid,
      purposes: [CURATE_LIST, MOD_LIST],
      limit: PER_REQUEST,
      cursor,
    });
    return { items: data.lists.map(toList), cursor: data.cursor };
  });

const listView = async (agent: Agent, id: string) =>
  (await agent.app.bsky.graph.getList({ list: listUri(id), limit: 1 })).data.list;

export async function bskyList(agent: Agent, id: string) {
  return toList(await listView(agent, id));
}

export async function bskyModList(agent: Agent, id: string) {
  return toModList(await listView(agent, id));
}

export async function bskyListTimelinePage(agent: Agent, id: string, cursor?: string): Promise<Post[]> {
  const { data } = await agent.app.bsky.feed.getListFeed({ list: listUri(id), limit: PAGE_SIZE, cursor });
  return toPage(data.feed, data.cursor);
}

export const listItems = (agent: Agent, id: string) =>
  drain(async (cursor) => {
    const { data } = await agent.app.bsky.graph.getList({ list: listUri(id), limit: PER_REQUEST, cursor });
    return { items: data.items, cursor: data.cursor };
  });

export async function bskyListMembers(agent: Agent, id: string): Promise<Author[]> {
  return (await listItems(agent, id)).map((item) => toAuthor(item.subject));
}

// Moderation lists can hold thousands of accounts, so their screen reads them a page at a time.
export async function* bskyListMemberPages(agent: Agent, id: string): AsyncGenerator<Author[]> {
  let cursor: string | undefined;
  do {
    const { data } = await agent.app.bsky.graph.getList({ list: listUri(id), limit: PAGE_SIZE, cursor });
    cursor = data.cursor;
    yield data.items.map((item) => toAuthor(item.subject));
  } while (cursor);
}

export async function bskyCreateList(agent: Agent, { title, purpose }: ListSettings): Promise<UserList> {
  const lexicon = purpose === 'mod' ? MOD_LIST : CURATE_LIST;
  const { uri } = await agent.app.bsky.graph.list.create(
    { repo: agent.assertDid },
    { name: title, purpose: lexicon, createdAt: new Date().toISOString() },
  );
  return { id: listId(uri), title, purpose: purposeOf(lexicon) };
}

export const bskyModListSubscriptions = (agent: Agent, kind: ModListKind): Promise<ModList[]> =>
  drain(async (cursor) => {
    const page = { limit: PER_REQUEST, cursor };
    const { data } = kind === 'mute' ? await agent.app.bsky.graph.getListMutes(page) : await agent.app.bsky.graph.getListBlocks(page);
    return { items: data.lists.map(toModList), cursor: data.cursor };
  });

export async function bskySetModListSubscription(agent: Agent, id: string, kind: ModListKind, on: boolean) {
  const uri = listUri(id);
  if (kind === 'mute') {
    if (on) await agent.muteModList(uri);
    else await agent.unmuteModList(uri);
  } else if (on) {
    await agent.blockModList(uri);
  } else {
    await agent.unblockModList(uri);
  }
}

export async function bskyResolveUrl(agent: Agent, url: string) {
  const link = bskyRecordLink(url);
  if (!link) return null;
  const did = link.handle.startsWith('did:')
    ? link.handle
    : (await agent.com.atproto.identity.resolveHandle({ handle: link.handle })).data.did;
  return { type: link.kind, id: `${did}@${link.rkey}` };
}

export async function bskyRenameList(agent: Agent, id: string, { title }: ListSettings): Promise<UserList> {
  const repo = agent.assertDid;
  const rkey = rkeyOf(id);
  const { value } = await agent.app.bsky.graph.list.get({ repo, rkey });
  await agent.app.bsky.graph.list.put({ repo, rkey }, { ...value, name: title });
  return { id, title, purpose: purposeOf(value.purpose) };
}

export async function bskyDeleteList(agent: Agent, id: string) {
  await agent.app.bsky.graph.list.delete({ repo: agent.assertDid, rkey: rkeyOf(id) });
}

export async function bskySetListMember(agent: Agent, id: string, did: string, member: boolean) {
  const repo = agent.assertDid;
  if (member) {
    await agent.app.bsky.graph.listitem.create({ repo }, { subject: did, list: listUri(id), createdAt: new Date().toISOString() });
    return;
  }
  const item = (await listItems(agent, id)).find((i) => i.subject.did === did);
  if (item) await agent.app.bsky.graph.listitem.delete({ repo, rkey: new AtUri(item.uri).rkey });
}

export async function bskyListCandidates(agent: Agent, q: string) {
  const { data } = await agent.searchActors({ q, limit: 10 });
  return data.actors.map(toAuthor);
}
