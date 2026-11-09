import type { Agent, AppBskyNotificationListNotifications } from '@atproto/api';

import { bskyNotificationPage, hydratePosts } from '@/api/bsky/notification-page';
import { groupNotifications } from '@/api/notification-groups';
import { notificationType, toNotification } from '@/model/adapters/bsky';

type Raw = AppBskyNotificationListNotifications.Notification;

const POST = 'at://did:plc:me/app.bsky.feed.post/3kmine';

const author = (name: string) => ({ did: `did:plc:${name}`, handle: `${name}.test` });

const raw = (reason: string, name: string, extra: Partial<Raw> = {}): Raw => ({
  uri: `at://did:plc:${name}/app.bsky.feed.${['reply', 'mention', 'quote'].includes(reason) ? 'post' : reason}/${name}-${reason}`,
  cid: `cid-${name}`,
  author: author(name),
  reason,
  record: {},
  isRead: false,
  indexedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const view = (uri: string) => ({
  uri,
  cid: 'cid',
  author: author('me'),
  record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' },
  indexedAt: '2026-01-01T00:00:00.000Z',
});

const fakeAgent = (notifications: Raw[], cursor?: string) => {
  const getPosts = jest.fn(async ({ uris }: { uris: string[] }) => ({ data: { posts: uris.map(view) } }));
  const listNotifications = jest.fn(async () => ({ data: { notifications, cursor } }));
  return { agent: { getPosts, listNotifications } as unknown as Agent, getPosts, listNotifications };
};

describe('notificationType', () => {
  it.each([
    ['like', 'like'],
    ['like-via-repost', 'like'],
    ['repost', 'repost'],
    ['repost-via-repost', 'repost'],
    ['follow', 'follow'],
    ['mention', 'mention'],
    ['reply', 'mention'],
    ['quote', 'quote'],
    ['subscribed-post', 'post'],
    ['starterpack-joined', 'other'],
    ['verified', 'other'],
    ['unverified', 'other'],
    ['contact-match', 'other'],
    ['something-new', 'other'],
  ])('maps %s to %s', (reason, type) => {
    expect(notificationType(reason)).toBe(type);
  });
});

describe('toNotification', () => {
  it('attaches the subject post to likes and the record post to replies', () => {
    const like = toNotification(raw('like', 'a', { reasonSubject: POST }), new Map([[POST, { id: 'subject' } as never]]));
    expect(like.post).toMatchObject({ id: 'subject' });
    expect(like.id).toBe('at://did:plc:a/app.bsky.feed.like/a-like');

    const reply = raw('reply', 'b');
    const withPost = toNotification(reply, new Map([[reply.uri, { id: 'reply' } as never]]));
    expect(withPost.post).toMatchObject({ id: 'reply' });
    expect(withPost.nativeType).toBe('reply');
  });

  it('keeps an unknown reason as other without a post', () => {
    const n = toNotification(raw('brand-new', 'c', { reasonSubject: POST }));
    expect(n).toMatchObject({ type: 'other', nativeType: 'brand-new', post: undefined });
  });
});

describe('hydratePosts', () => {
  it('dedupes URIs, skips empty ones and batches in 25s', async () => {
    const { agent, getPosts } = fakeAgent([]);
    const uris = Array.from({ length: 60 }, (_, i) => `at://did:plc:me/app.bsky.feed.post/p${i}`);
    const posts = await hydratePosts(agent, [...uris, ...uris, undefined]);
    expect(getPosts.mock.calls.map(([arg]) => arg.uris.length)).toEqual([25, 25, 10]);
    expect(posts.size).toBe(60);
  });
});

describe('bskyNotificationPage', () => {
  it('hydrates subjects once, ignores repost subjects and sets the cursor', async () => {
    const { agent, getPosts, listNotifications } = fakeAgent(
      [
        raw('like', 'a', { reasonSubject: POST }),
        raw('repost', 'b', { reasonSubject: POST }),
        raw('like-via-repost', 'c', { reasonSubject: 'at://did:plc:me/app.bsky.feed.repost/r1' }),
        raw('follow', 'd'),
      ],
      'next',
    );
    const page = await bskyNotificationPage(agent, 'mentions', 'abc');
    expect(listNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'abc', reasons: ['mention', 'reply', 'quote'] }),
    );
    expect(getPosts).toHaveBeenCalledTimes(1);
    expect(getPosts).toHaveBeenCalledWith({ uris: [POST] });
    expect(page.map((n) => !!n.post)).toEqual([true, true, false, false]);
    expect(page.at(-1)?.cursor).toBe('next');
  });

  it('skips getPosts when nothing needs a post', async () => {
    const { agent, getPosts } = fakeAgent([raw('follow', 'a')]);
    await bskyNotificationPage(agent, 'follows');
    expect(getPosts).not.toHaveBeenCalled();
  });
});

describe('grouping', () => {
  it('groups likes and reposts of the same post like AP', async () => {
    const { agent } = fakeAgent([
      raw('like', 'a', { reasonSubject: POST }),
      raw('like', 'b', { reasonSubject: POST }),
      raw('repost', 'c', { reasonSubject: POST }),
      raw('repost', 'd', { reasonSubject: POST }),
      raw('like', 'e', { reasonSubject: 'at://did:plc:me/app.bsky.feed.post/other' }),
      raw('brand-new', 'f'),
      raw('verified', 'g'),
    ]);
    const items = groupNotifications(await bskyNotificationPage(agent, 'all'));
    expect(items.map((i) => (i.kind === 'group' ? `${i.type}:${i.notifications.length}` : i.notification.type))).toEqual([
      'like:2',
      'repost:2',
      'like',
      'other',
    ]);
    const last = items.at(-1);
    expect(last?.kind === 'single' ? last.notification.nativeType : undefined).toBe('verified');
  });

  it('keeps a page of only unknown reasons so paging continues', async () => {
    const { agent } = fakeAgent([raw('brand-new', 'a')]);
    const page = await bskyNotificationPage(agent, 'all');
    expect(page).toHaveLength(1);
  });
});
