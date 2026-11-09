import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import {
  applyAction,
  patchStatus,
  removeStatus,
  restoreSnapshot,
  snapshotStatusCaches,
} from '@/api/cache';
import { keys } from '@/api/keys';
import type { Notification, Post } from '@/model/post';

const status = (id: string, extra: Partial<Post> = {}) =>
  ({
    id,
    uid: `ap:${id}`,
    key: `ap:${id}`,
    cursor: id,
    viewer: { liked: false, reposted: false },
    counts: { replies: 0, reposts: 0, likes: 0 },
    raw: {},
    ...extra,
  }) as unknown as Post;

const repost = (wrapperId: string, inner: Post) =>
  status(inner.id, {
    key: `${inner.uid}:${wrapperId}`,
    cursor: wrapperId,
    sortAt: 'later',
    repostedBy: { handle: 'booster' } as Post['repostedBy'],
    wrapperId,
  });

describe('status cache', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    client.setQueryData<InfiniteData<Post[]>>(keys.timeline('home'), {
      pages: [[status('1'), repost('w', status('2'))]],
      pageParams: [undefined],
    });
    client.setQueryData(keys.status('2'), status('2'));
  });

  afterEach(() => client.clear());

  it('patches a status everywhere, including inside reblogs', () => {
    patchStatus(client, '2', (s) => applyAction(s, 'favourite', true));

    const timeline = client.getQueryData<InfiniteData<Post[]>>(keys.timeline('home'));
    expect(timeline?.pages[0][1]).toMatchObject({
      viewer: { liked: true },
      counts: { likes: 1 },
      key: 'ap:2:w',
      cursor: 'w',
      sortAt: 'later',
      repostedBy: { handle: 'booster' },
    });
    expect(client.getQueryData<Post>(keys.status('2'))).toMatchObject({ viewer: { liked: true } });
    expect(timeline?.pages[0][0]).toMatchObject({ viewer: { liked: false } });
  });

  it('restores the previous state from a snapshot', async () => {
    const snapshot = await snapshotStatusCaches(client);
    patchStatus(client, '1', (s) => applyAction(s, 'favourite', true));
    restoreSnapshot(client, snapshot);

    const timeline = client.getQueryData<InfiniteData<Post[]>>(keys.timeline('home'));
    expect(timeline?.pages[0][0]).toMatchObject({ viewer: { liked: false }, counts: { likes: 0 } });
  });

  it('never lets counts go negative', () => {
    expect(applyAction(status('3'), 'favourite', false).counts.likes).toBe(0);
  });

  it('removes a deleted status and boosts of it everywhere', () => {
    client.setQueryData(keys.status('2'), status('2'));
    removeStatus(client, '2');
    const home = client.getQueryData<InfiniteData<Post[]>>(keys.timeline('home'));
    expect(home?.pages[0].map((s) => s.id)).toEqual(['1']);
    expect(client.getQueryData(keys.status('2'))).toBeUndefined();
  });

  it('matches a boost by its wrapper id', () => {
    patchStatus(client, 'w', (s) => applyAction(s, 'bookmark', true));
    const timeline = client.getQueryData<InfiniteData<Post[]>>(keys.timeline('home'));
    expect(timeline?.pages[0][1].viewer.bookmarked).toBe(true);
    removeStatus(client, 'w');
    expect(client.getQueryData<InfiniteData<Post[]>>(keys.timeline('home'))?.pages[0].map((s) => s.id)).toEqual(['1']);
  });

  it('patches the post inside cached notifications', () => {
    const n = { id: 'n', post: status('2') } as unknown as Notification;
    client.setQueryData<InfiniteData<Notification[]>>(keys.notificationList('all'), { pages: [[n]], pageParams: [undefined] });
    patchStatus(client, '2', (s) => applyAction(s, 'reblog', true));
    const data = client.getQueryData<InfiniteData<Notification[]>>(keys.notificationList('all'));
    expect(data?.pages[0][0].post).toMatchObject({ viewer: { reposted: true }, counts: { reposts: 1 } });
    removeStatus(client, '2');
    expect(client.getQueryData<InfiniteData<Notification[]>>(keys.notificationList('all'))?.pages[0]).toEqual([]);
  });

  it('leaves trending tags and links out of status patches', () => {
    const tags = { pages: [[{ name: 'expo', url: 'https://x/tags/expo', history: [] }]], pageParams: [0] };
    client.setQueryData(keys.trending('tags'), tags);
    expect(() => patchStatus(client, '1', (p) => applyAction(p, 'favourite', true))).not.toThrow();
    expect(client.getQueryData(keys.trending('tags'))).toBe(tags);
  });
});
