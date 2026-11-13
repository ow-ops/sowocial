import { AppBskyGraphStarterpack, AtUri, type Agent, type AppBskyGraphDefs } from '@atproto/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { chunked } from '@/utils/chunked';

import { useBsky } from '../client';
import { getAgent } from '../clients';
import { keys } from '../keys';
import { handlesError } from '../mutation-meta';
import { graphemeCount } from './compose';
import { listId, listItems, recordUri } from './lists';

const STARTER_PACK_COLLECTION = 'app.bsky.graph.starterpack';
const REFERENCE_LIST = 'app.bsky.graph.defs#referencelist';

// maxGraphemes of app.bsky.graph.starterpack name and description.
export const STARTER_PACK_MAX = { name: 50, description: 300 } as const;

export const graphemesLeft = (value: string, max: number) => max - graphemeCount(value.trim());

// The counter appears once a fifth of the limit remains.
export const nearLimit = (left: number, max: number) => left <= max / 5;

const starterPackUri = (id: string) => recordUri(id, STARTER_PACK_COLLECTION);

export function starterPackRecord(pack: { record: unknown }) {
  const result = AppBskyGraphStarterpack.validateRecord(pack.record);
  return result.success ? result.value : undefined;
}

export const starterPackName = (pack: { record: unknown }) => starterPackRecord(pack)?.name ?? '';

export async function bskyStarterPack(agent: Agent, id: string) {
  const { data } = await agent.app.bsky.graph.getStarterPack({ starterPack: starterPackUri(id) });
  return data.starterPack;
}

export async function bskyCreateStarterPack(agent: Agent, { name, description }: { name: string; description?: string }) {
  const repo = agent.assertDid;
  const createdAt = new Date().toISOString();
  const { uri: list } = await agent.app.bsky.graph.list.create({ repo }, { name, purpose: REFERENCE_LIST, createdAt });
  const { uri } = await agent.app.bsky.graph.starterpack.create({ repo }, { name, description, list, createdAt });
  return listId(uri);
}

async function bskyDeleteStarterPack(agent: Agent, pack: AppBskyGraphDefs.StarterPackView) {
  const repo = agent.assertDid;
  await agent.app.bsky.graph.starterpack.delete({ repo, rkey: new AtUri(pack.uri).rkey });
  if (pack.list) await agent.app.bsky.graph.list.delete({ repo, rkey: new AtUri(pack.list.uri).rkey });
}

export async function bskyFollowMembers(agent: Agent, list: string, onProgress: (done: number, total: number) => void) {
  const me = agent.assertDid;
  const todo = (await listItems(agent, list)).filter(({ subject }) => subject.did !== me && !subject.viewer?.following);
  let done = 0;
  for (const chunk of chunked(todo)) {
    await Promise.all(chunk.map(({ subject }) => agent.follow(subject.did)));
    done += chunk.length;
    onProgress(done, todo.length);
  }
  return done;
}

export function useStarterPack(id: string) {
  return useQuery({ queryKey: keys.bskyStarterPack(id), queryFn: () => bskyStarterPack(getAgent(), id) });
}

export function useActorStarterPacks(actor: string) {
  return useQuery({
    queryKey: keys.bskyActorStarterPacks(actor),
    queryFn: async () => (await getAgent().app.bsky.graph.getActorStarterPacks({ actor })).data.starterPacks,
  });
}

export function useCreateStarterPack() {
  const agent = useBsky();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (input: { name: string; description?: string }) => bskyCreateStarterPack(agent, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.bskyStarterPacks }),
  });
}

export function useDeleteStarterPack() {
  const agent = useBsky();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (pack: AppBskyGraphDefs.StarterPackView) => bskyDeleteStarterPack(agent, pack),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.bskyStarterPacks }),
  });
}

export function useFollowMembers(list: string) {
  const agent = useBsky();
  const queryClient = useQueryClient();
  return useMutation({
    meta: handlesError,
    mutationFn: (onProgress: (done: number, total: number) => void) => bskyFollowMembers(agent, list, onProgress),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.listMembers(list) }),
  });
}
