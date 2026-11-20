import type { Agent } from '@atproto/api';

import { notificationPostUri, toNotification, toPost } from '@/model/adapters/bsky';
import { pageOf, type Page } from '@/model/page';
import type { Notification, Post } from '@/model/post';

import type { NotificationFilter } from '../keys';
import { PAGE_SIZE } from '../pagination';

const GET_POSTS_LIMIT = 25;

const REASONS: Record<NotificationFilter, string[] | undefined> = {
  all: undefined,
  mentions: ['mention', 'reply', 'quote'],
  follows: ['follow'],
};

export async function hydratePosts(agent: Agent, uris: (string | undefined)[]) {
  const unique = [...new Set(uris.filter((uri): uri is string => !!uri))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += GET_POSTS_LIMIT) batches.push(unique.slice(i, i + GET_POSTS_LIMIT));
  const results = await Promise.all(batches.map((batch) => agent.getPosts({ uris: batch })));
  const posts = new Map<string, Post>();
  for (const { data } of results) for (const view of data.posts) posts.set(view.uri, toPost(view));
  return posts;
}

const NAMED_OTHER = new Set(['starterpack-joined', 'verified', 'unverified']);

export async function bskyNotificationPage(
  agent: Agent,
  filter: NotificationFilter,
  cursor?: string,
): Promise<Page<Notification>> {
  const { data } = await agent.listNotifications({ limit: PAGE_SIZE, cursor, reasons: REASONS[filter] });
  const posts = await hydratePosts(agent, data.notifications.map(notificationPostUri));
  const all = data.notifications.map((n) => toNotification(n, posts));
  const known = all.filter((n) => n.type !== 'other' || NAMED_OTHER.has(n.nativeType));
  return pageOf(known.length > 0 ? known : all, data.cursor);
}
