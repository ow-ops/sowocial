import type { Agent } from '@atproto/api';

import { toAuthor } from '@/model/adapters/bsky';

const COUNT = 5;

export async function bskySuggestedFollows(agent: Agent) {
  const { data } = await agent.app.bsky.actor.getSuggestions({ limit: COUNT });
  return data.actors.map(toAuthor);
}
