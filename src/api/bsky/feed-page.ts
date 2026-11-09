import type { Agent } from '@atproto/api';

import { toPage } from '@/model/adapters/bsky';

import { PAGE_SIZE } from '../pagination';

export async function bskyFeedPage(agent: Agent, feed: string, cursor?: string) {
  const { data } = await agent.app.bsky.feed.getFeed({ feed, limit: PAGE_SIZE, cursor });
  return toPage(data.feed, data.cursor);
}
