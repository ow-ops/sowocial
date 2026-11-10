import { AppBskyFeedDefs, type Agent } from '@atproto/api';

import { toPostPage } from '@/model/adapters/bsky';
import type { Post } from '@/model/post';

import { PAGE_SIZE } from '../pagination';

export async function bskyBookmarksPage(agent: Agent, cursor?: string): Promise<Post[]> {
  const { data } = await agent.app.bsky.bookmark.getBookmarks({ limit: PAGE_SIZE, cursor });
  const posts = data.bookmarks.flatMap(({ item }) => (AppBskyFeedDefs.isPostView(item) ? [item as AppBskyFeedDefs.PostView] : []));
  return toPostPage(posts, data.cursor);
}

export async function bskySetBookmark(agent: Agent, post: { uri: string; cid: string }, on: boolean) {
  if (on) await agent.app.bsky.bookmark.createBookmark({ uri: post.uri, cid: post.cid });
  else await agent.app.bsky.bookmark.deleteBookmark({ uri: post.uri });
}
