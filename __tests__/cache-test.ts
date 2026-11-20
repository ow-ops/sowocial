import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import {
  applyAction,
  applyEdits,
  patchStatus,
  removeStatus,
  revertAction,
} from '@/api/cache';
import { keys } from '@/api/keys';
import type { Page } from '@/model/page';
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

const A = 'account.mine.test.1';

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
    client.setQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'), {
      pages: [{ items: [status('1'), repost('w', status('2'))] }],
      pageParams: [undefined],
    });
    client.setQueryData(keys.status(A, '2'), status('2'));
  });

  afterEach(() => client.clear());

  it('patches a status everywhere, including inside reblogs', () => {
    patchStatus(client, A, '2', (s) => applyAction(s, 'favourite', true));

    const timeline = client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'));
    expect(timeline?.pages[0].items[1]).toMatchObject({
      viewer: { liked: true },
      counts: { likes: 1 },
      key: 'ap:2:w',
      cursor: 'w',
      sortAt: 'later',
      repostedBy: { handle: 'booster' },
    });
    expect(client.getQueryData<Post>(keys.status(A, '2'))).toMatchObject({ viewer: { liked: true } });
    expect(timeline?.pages[0].items[0]).toMatchObject({ viewer: { liked: false } });
  });

  it('reverts a failed like on its own post and leaves a later like alone', () => {
    const [one, two] = [status('1'), status('2')];
    for (const s of [one, two]) patchStatus(client, A, s.id, (p) => applyAction(p, 'favourite', true));
    patchStatus(client, A, '1', (p) => revertAction(p, 'favourite', true, one));

    const timeline = client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'));
    expect(timeline?.pages[0].items[0]).toMatchObject({ viewer: { liked: false }, counts: { likes: 0 } });
    expect(timeline?.pages[0].items[1]).toMatchObject({ viewer: { liked: true }, counts: { likes: 1 } });
  });

  it('does not revert over a newer action on the same post', () => {
    const before = status('1');
    const liked = applyAction(before, 'favourite', true);
    const unliked = applyAction(liked, 'favourite', false);
    expect(revertAction(unliked, 'favourite', true, before)).toBe(unliked);
  });

  it('restores the like uri when a failed unlike is reverted', () => {
    const before = status('1', { viewer: { liked: true, reposted: false, likeUri: 'at://like' }, counts: { replies: 0, reposts: 0, likes: 3 } } as Partial<Post>);
    const unliked = applyAction(before, 'favourite', false);
    expect(revertAction(unliked, 'favourite', false, before)).toMatchObject({ viewer: { liked: true, likeUri: 'at://like' }, counts: { likes: 3 } });
  });

  describe('page cursors', () => {
    const seed = (pages: Page<Post>[]) =>
      client.setQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'), { pages, pageParams: pages.map((_, i) => (i ? `c${i}` : undefined)) });
    const home = () => client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'))!;

    it('keeps the page cursor when the last post of a page is removed', () => {
      seed([{ items: [status('a'), status('b')], next: 'server-cursor' }]);
      removeStatus(client, A, 'b');
      expect(home().pages[0].items.map((s) => s.id)).toEqual(['a']);
      expect(home().pages[0].next).toBe('server-cursor');
    });

    it('keeps a page the removal emptied, so its cursor still reaches the next one', () => {
      seed([{ items: [status('a')], next: 'c1' }, { items: [status('b')], next: 'c2' }]);
      removeStatus(client, A, 'b');
      expect(home().pages).toHaveLength(2);
      expect(home().pages[1]).toEqual({ items: [], next: 'c2' });
    });
  });

  it('never lets counts go negative', () => {
    expect(applyAction(status('3'), 'favourite', false).counts.likes).toBe(0);
  });

  it('removes a deleted status and boosts of it everywhere', () => {
    client.setQueryData(keys.status(A, '2'), status('2'));
    removeStatus(client, A, '2');
    const home = client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'));
    expect(home?.pages[0].items.map((s) => s.id)).toEqual(['1']);
    expect(client.getQueryData(keys.status(A, '2'))).toBeUndefined();
  });

  it('matches a boost by its wrapper id', () => {
    patchStatus(client, A, 'w', (s) => applyAction(s, 'bookmark', true));
    const timeline = client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'));
    expect(timeline?.pages[0].items[1].viewer.bookmarked).toBe(true);
    removeStatus(client, A, 'w');
    expect(client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'))?.pages[0].items.map((s) => s.id)).toEqual(['1']);
  });

  it('applies edits from a refetched page, keeping each entry as cached', () => {
    const cached = client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'))!.pages.flatMap((page) => page.items);
    const edited = (id: string) => ({ editedAt: 'now', content: { kind: 'segments', segments: [{ type: 'text', text: `edited ${id}` }] } }) as Partial<Post>;
    applyEdits(client, A, cached, [{ ...repost('x', status('1')), ...edited('1') } as Post, status('2', edited('2')), status('9', edited('9'))]);

    const [first, second] = client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'))!.pages[0].items;
    expect(first).toMatchObject({ key: 'ap:1', cursor: '1', editedAt: 'now', repostedBy: undefined, wrapperId: undefined });
    expect(second).toMatchObject({ key: 'ap:2:w', cursor: 'w', sortAt: 'later', editedAt: 'now', wrapperId: 'w' });
    expect(client.getQueryData<Post>(keys.status(A, '2'))).toMatchObject({ key: 'ap:2', editedAt: 'now', wrapperId: undefined });
  });

  it('leaves posts alone when the refetched copy has the same edit', () => {
    const cached = client.getQueryData<InfiniteData<Page<Post>>>(keys.timeline(A, 'home'))!.pages.flatMap((page) => page.items);
    const before = client.getQueryData(keys.timeline(A, 'home'));
    applyEdits(client, A, cached, [status('1', { counts: { replies: 5, reposts: 0, likes: 0 } })]);
    expect(client.getQueryData(keys.timeline(A, 'home'))).toBe(before);
  });

  it('patches the post inside cached notifications', () => {
    const n = { id: 'n', post: status('2') } as unknown as Notification;
    client.setQueryData<InfiniteData<Page<Notification>>>(keys.notificationList(A, 'all'), { pages: [{ items: [n] }], pageParams: [undefined] });
    patchStatus(client, A, '2', (s) => applyAction(s, 'reblog', true));
    const data = client.getQueryData<InfiniteData<Page<Notification>>>(keys.notificationList(A, 'all'));
    expect(data?.pages[0].items[0].post).toMatchObject({ viewer: { reposted: true }, counts: { reposts: 1 } });
    removeStatus(client, A, '2');
    expect(client.getQueryData<InfiniteData<Page<Notification>>>(keys.notificationList(A, 'all'))?.pages[0].items).toEqual([]);
  });

  it('leaves trending tags and links out of status patches', () => {
    const tags = { pages: [[{ name: 'expo', url: 'https://x/tags/expo', history: [] }]], pageParams: [0] };
    client.setQueryData(keys.trending(A, 'tags'), tags);
    expect(() => patchStatus(client, A, '1', (p) => applyAction(p, 'favourite', true))).not.toThrow();
    expect(client.getQueryData(keys.trending(A, 'tags'))).toBe(tags);
  });
});

describe('mapKeepingGaps', () => {
  const { mapKeepingGaps } = jest.requireActual('@/api/cache') as typeof import('@/api/cache');
  const drop = (id: string) => (p: Post) => (p.id === id ? null : p);
  const gap = (id: string) => status(id, { gap: { sinceId: '0' } });
  const ids = (pages: Post[][]) => pages.map((p) => p.map((s) => `${s.id}${s.gap ? '*' : ''}`));

  it('moves the marker to the post above, since a gap lies below its carrier', () => {
    expect(ids(mapKeepingGaps([[status('3'), gap('2'), status('1')]], drop('2')))).toEqual([['3*', '1']]);
  });

  it('reaches the previous page when the dropped post starts a page', () => {
    expect(ids(mapKeepingGaps([[status('3')], [gap('2'), status('1')]], drop('2')))).toEqual([['3*'], ['1']]);
  });

  it('leaves unmarked drops alone', () => {
    expect(ids(mapKeepingGaps([[status('3'), status('2')]], drop('2')))).toEqual([['3']]);
  });
});
