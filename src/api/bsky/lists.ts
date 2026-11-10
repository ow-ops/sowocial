import { AtUri, type Agent, type AppBskyGraphDefs } from '@atproto/api';

import { toAuthor, toPage } from '@/model/adapters/bsky';
import type { Author, Post } from '@/model/post';

import type { ListSettings, UserList } from '../backend/types';
import { PAGE_SIZE } from '../pagination';

const LIST_COLLECTION = 'app.bsky.graph.list';
const CURATE_LIST = 'app.bsky.graph.defs#curatelist';
const PER_REQUEST = 100;

export const listId = (uri: string) => {
  const { hostname, rkey } = new AtUri(uri);
  return `${hostname}@${rkey}`;
};

export const listUri = (id: string) => {
  const at = id.indexOf('@');
  return `at://${id.slice(0, at)}/${LIST_COLLECTION}/${id.slice(at + 1)}`;
};

const rkeyOf = (id: string) => id.slice(id.indexOf('@') + 1);

const toList = (view: AppBskyGraphDefs.ListView): UserList => ({ id: listId(view.uri), title: view.name });

export async function bskyLists(agent: Agent): Promise<UserList[]> {
  const lists: UserList[] = [];
  let cursor: string | undefined;
  do {
    const { data } = await agent.app.bsky.graph.getLists({
      actor: agent.assertDid,
      purposes: [CURATE_LIST],
      limit: PER_REQUEST,
      cursor,
    });
    lists.push(...data.lists.map(toList));
    cursor = data.cursor;
  } while (cursor);
  return lists;
}

export async function bskyList(agent: Agent, id: string) {
  const { data } = await agent.app.bsky.graph.getList({ list: listUri(id), limit: 1 });
  return toList(data.list);
}

export async function bskyListTimelinePage(agent: Agent, id: string, cursor?: string): Promise<Post[]> {
  const { data } = await agent.app.bsky.feed.getListFeed({ list: listUri(id), limit: PAGE_SIZE, cursor });
  return toPage(data.feed, data.cursor);
}

async function listItems(agent: Agent, id: string) {
  const items: AppBskyGraphDefs.ListItemView[] = [];
  let cursor: string | undefined;
  do {
    const { data } = await agent.app.bsky.graph.getList({ list: listUri(id), limit: PER_REQUEST, cursor });
    items.push(...data.items);
    cursor = data.cursor;
  } while (cursor);
  return items;
}

export async function bskyListMembers(agent: Agent, id: string): Promise<Author[]> {
  return (await listItems(agent, id)).map((item) => toAuthor(item.subject));
}

export async function bskyCreateList(agent: Agent, { title }: ListSettings): Promise<UserList> {
  const { uri } = await agent.app.bsky.graph.list.create(
    { repo: agent.assertDid },
    { name: title, purpose: CURATE_LIST, createdAt: new Date().toISOString() },
  );
  return { id: listId(uri), title };
}

export async function bskyRenameList(agent: Agent, id: string, { title }: ListSettings): Promise<UserList> {
  const repo = agent.assertDid;
  const rkey = rkeyOf(id);
  const { value } = await agent.app.bsky.graph.list.get({ repo, rkey });
  await agent.app.bsky.graph.list.put({ repo, rkey }, { ...value, name: title });
  return { id, title };
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
