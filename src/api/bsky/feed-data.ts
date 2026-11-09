import type { Agent, AppBskyActorDefs, AppBskyFeedDefs } from '@atproto/api';

const GENERATOR_COLLECTION = 'app.bsky.feed.generator';
const GENERATORS_PER_REQUEST = 25;

export type SavedFeedEntry = { saved: AppBskyActorDefs.SavedFeed; view: AppBskyFeedDefs.GeneratorView };

export type SavedFeedAction = 'save' | 'remove' | 'pin' | 'unpin';

export const feedId = (uri: string) => {
  const [hostname, , rkey] = uri.replace('at://', '').split('/');
  return `${hostname}@${rkey}`;
};

export const feedUri = (id: string) => {
  const at = id.indexOf('@');
  return `at://${id.slice(0, at)}/${GENERATOR_COLLECTION}/${id.slice(at + 1)}`;
};

export async function bskySavedFeeds(agent: Agent, savedFeeds: AppBskyActorDefs.SavedFeed[]): Promise<SavedFeedEntry[]> {
  const feeds = savedFeeds.filter((f) => f.type === 'feed');
  const chunks = Array.from({ length: Math.ceil(feeds.length / GENERATORS_PER_REQUEST) }, (_, i) =>
    feeds.slice(i * GENERATORS_PER_REQUEST, (i + 1) * GENERATORS_PER_REQUEST),
  );
  const responses = await Promise.all(
    chunks.map((chunk) => agent.app.bsky.feed.getFeedGenerators({ feeds: chunk.map((f) => f.value) })),
  );
  const views = new Map(responses.flatMap((r) => r.data.feeds).map((view) => [view.uri, view]));
  const entries = feeds.flatMap((saved) => {
    const view = views.get(saved.value);
    return view ? [{ saved, view }] : [];
  });
  return [...entries.filter((e) => e.saved.pinned), ...entries.filter((e) => !e.saved.pinned)];
}

export async function bskyUpdateSavedFeed(agent: Agent, uri: string, action: SavedFeedAction) {
  const { savedFeeds } = await agent.getPreferences();
  const current = savedFeeds.find((f) => f.type === 'feed' && f.value === uri);
  if (action === 'save') return current ? savedFeeds : agent.addSavedFeeds([{ type: 'feed', value: uri, pinned: false }]);
  if (!current) return savedFeeds;
  if (action === 'remove') return agent.removeSavedFeeds([current.id]);
  return agent.updateSavedFeeds([{ ...current, pinned: action === 'pin' }]);
}
