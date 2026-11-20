import { AppBskyFeedDefs, AtUri, type Agent } from '@atproto/api';

import { t } from '@/i18n';
import { postUri, toAuthor, toPage, toPost, toPostPage, toRelationship, toThread } from '@/model/adapters/bsky';
import { pageOf, type Page } from '@/model/page';
import type { Author, Post, Relationship } from '@/model/post';

import type { SearchFilters } from '../backend/types';
import type { Timeline } from '../keys';
import { PAGE_SIZE } from '../pagination';
import { bskyPostSearch } from './search-query';

export type AuthorFeedTab = 'posts' | 'replies' | 'media';

const AUTHOR_FILTERS = {
  posts: 'posts_no_replies',
  replies: 'posts_with_replies',
  media: 'posts_with_media',
} as const;

export async function bskyTimelinePage(agent: Agent, timeline: Timeline, cursor?: string): Promise<Page<Post>> {
  if (timeline === 'home') {
    const { data } = await agent.getTimeline({ limit: PAGE_SIZE, cursor });
    return toPage(data.feed, data.cursor);
  }
  if (typeof timeline === 'object') {
    const { data } = await agent.app.bsky.feed.searchPosts({
      q: `#${timeline.tag}`,
      sort: 'latest',
      limit: PAGE_SIZE,
      cursor,
    });
    return toPostPage(data.posts, data.cursor);
  }
  return pageOf([], undefined);
}

export async function bskyAuthorFeedPage(agent: Agent, actor: string, tab: AuthorFeedTab, cursor?: string) {
  const { data } = await agent.getAuthorFeed({ actor, filter: AUTHOR_FILTERS[tab], limit: PAGE_SIZE, cursor });
  return toPage(data.feed, data.cursor);
}

export async function bskyPost(agent: Agent, id: string) {
  const { data } = await agent.getPosts({ uris: [postUri(id)] });
  const [view] = data.posts;
  if (!view) throw new Error(t('status.thread.unavailable'));
  return toPost(view);
}

export async function bskyThread(agent: Agent, id: string) {
  const { data } = await agent.getPostThread({ uri: postUri(id), depth: 20, parentHeight: 40 });
  if (!AppBskyFeedDefs.isThreadViewPost(data.thread)) throw new Error(t('status.thread.unavailable'));
  const { ancestors, descendants } = toThread(data.thread as AppBskyFeedDefs.ThreadViewPost);
  return { ancestors, descendants };
}

export async function bskyProfile(agent: Agent, actor: string) {
  const { data } = await agent.getProfile({ actor });
  return toAuthor(data);
}

export async function bskyPinnedPost(agent: Agent, actor: string): Promise<Post[]> {
  const { data } = await agent.getProfile({ actor });
  if (!data.pinnedPost) return [];
  const { data: posts } = await agent.getPosts({ uris: [data.pinnedPost.uri] });
  return posts.posts.map((p) => {
    const post = toPost(p);
    return { ...post, viewer: { ...post.viewer, pinned: true } };
  });
}

export async function* bskyFollowPages(
  agent: Agent,
  actor: string,
  kind: 'followers' | 'following',
  limit: number,
): AsyncGenerator<Author[]> {
  let cursor: string | undefined;
  do {
    if (kind === 'followers') {
      const { data } = await agent.getFollowers({ actor, limit, cursor });
      cursor = data.cursor;
      yield data.followers.map(toAuthor);
    } else {
      const { data } = await agent.getFollows({ actor, limit, cursor });
      cursor = data.cursor;
      yield data.follows.map(toAuthor);
    }
  } while (cursor);
}

export async function* bskyInteractionPages(
  agent: Agent,
  id: string,
  kind: 'likes' | 'reposts',
  limit: number,
): AsyncGenerator<Author[]> {
  const uri = postUri(id);
  let cursor: string | undefined;
  do {
    if (kind === 'likes') {
      const { data } = await agent.getLikes({ uri, limit, cursor });
      cursor = data.cursor;
      yield data.likes.map((like) => toAuthor(like.actor));
    } else {
      const { data } = await agent.getRepostedBy({ uri, limit, cursor });
      cursor = data.cursor;
      yield data.repostedBy.map(toAuthor);
    }
  } while (cursor);
}

export async function bskySearch(agent: Agent, q: string, filters?: SearchFilters) {
  const [people, posts] = await Promise.all([
    agent.searchActors({ q, limit: 20 }),
    agent.app.bsky.feed.searchPosts({ ...bskyPostSearch(q, filters), limit: 20 }),
  ]);
  const [, tag] = q.trim().match(/^#(\S+)$/) ?? [];
  return {
    accounts: people.data.actors.map(toAuthor),
    statuses: posts.data.posts.map((p) => toPost(p)),
    hashtags: tag ? [{ name: tag }] : [],
  };
}

export async function bskyRelationship(agent: Agent, actor: string) {
  const { data } = await agent.getProfile({ actor });
  return toRelationship(data.viewer);
}

export type BskyRelationshipAction = 'follow' | 'unfollow' | 'mute' | 'unmute' | 'block' | 'unblock';

export async function bskyUpdateRelationship(
  agent: Agent,
  did: string,
  action: BskyRelationshipAction,
): Promise<Relationship> {
  const current = await bskyRelationship(agent, did);
  switch (action) {
    case 'follow': {
      if (current.following) return current;
      const { uri } = await agent.follow(did);
      return { ...current, following: true, followUri: uri };
    }
    case 'unfollow':
      if (current.followUri) await agent.deleteFollow(current.followUri);
      return { ...current, following: false, followUri: undefined };
    case 'mute':
      await agent.mute(did);
      return { ...current, muting: true };
    case 'unmute':
      await agent.unmute(did);
      return { ...current, muting: false };
    case 'block': {
      if (current.blocking) return current;
      const { uri } = await agent.app.bsky.graph.block.create(
        { repo: agent.assertDid },
        { subject: did, createdAt: new Date().toISOString() },
      );
      return { ...current, blocking: true, blockUri: uri };
    }
    case 'unblock':
      if (current.blockUri) {
        await agent.app.bsky.graph.block.delete({ repo: agent.assertDid, rkey: new AtUri(current.blockUri).rkey });
      }
      return { ...current, blocking: false, blockUri: undefined };
  }
}
