import type { mastodon } from 'masto';

import { groupNotifications } from '@/api/notification-groups';
import { toAuthor, toNotification, toPost } from '@/model/adapters/ap';
import { contentToText, firstContentLink } from '@/model/content';

import accountLocal from './fixtures/account-local.json';
import accountRemote from './fixtures/account-remote.json';
import statusFixture from './fixtures/status.json';

type Status = mastodon.v1.Status;
type Notification = mastodon.v1.Notification;

const alice = accountLocal as unknown as mastodon.v1.Account;
const bob = accountRemote as unknown as mastodon.v1.Account;

const status = (extra: Partial<Status> = {}) =>
  ({ ...statusFixture, account: alice, reblog: null, quote: null, ...extra }) as unknown as Status;

const plain = (id: string, extra: Partial<Status> = {}) =>
  status({
    id,
    editedAt: null,
    spoilerText: '',
    mediaAttachments: [],
    poll: null,
    card: null,
    filtered: undefined,
    ...extra,
  });

describe('toAuthor', () => {
  const account = (extra: object) => ({ ...alice, ...extra }) as unknown as mastodon.v1.Account;

  it('maps profile fields with verification and html values', () => {
    const author = toAuthor(
      account({
        fields: [
          { name: 'Site', value: '<a href="https://a.example" rel="me">a.example</a>', verifiedAt: '2024-01-02T00:00:00.000Z' },
          { name: 'Pronouns', value: 'she/her', verifiedAt: null },
        ],
      }),
    );
    expect(author.fields).toHaveLength(2);
    expect(author.fields?.[0]).toMatchObject({ name: 'Site', verifiedAt: '2024-01-02T00:00:00.000Z' });
    expect(author.fields?.[0].value).toMatchObject({ kind: 'html', html: expect.stringContaining('a.example') });
    expect(author.fields?.[1].verifiedAt).toBeUndefined();
  });

  it('maps roles, falling back to the single GoToSocial role', () => {
    expect(toAuthor(account({ roles: [{ id: 1, name: 'Admin', color: '' }] })).roles).toEqual([
      { name: 'Admin', color: undefined },
    ]);
    expect(toAuthor(account({ roles: undefined, role: { name: 'moderator' } })).roles).toEqual([
      { name: 'moderator', color: undefined },
    ]);
    expect(toAuthor(alice).roles).toEqual([]);
  });

  it('maps bot, locked, createdAt and url', () => {
    expect(toAuthor(account({ bot: true, locked: true }))).toMatchObject({
      bot: true,
      locked: true,
      createdAt: '2023-08-24T00:00:00.000Z',
      url: 'https://social.example/@alice',
    });
  });
});

describe('toPost', () => {
  it('maps a full Mastodon status', () => {
    const post = toPost(status());

    expect(post).toMatchObject({
      uid: 'ap:01HX0000000000000000000001',
      key: 'ap:01HX0000000000000000000001',
      cursor: '01HX0000000000000000000001',
      id: '01HX0000000000000000000001',
      protocol: 'ap',
      createdAt: '2024-05-01T10:00:00.000Z',
      sortAt: '2024-05-01T10:00:00.000Z',
      editedAt: '2024-05-01T10:05:00.000Z',
      sensitive: true,
      visibility: 'unlisted',
      language: 'en',
      url: 'https://social.example/@alice/statuses/01HX0000000000000000000001',
      counts: { replies: 2, reposts: 3, likes: 5 },
      viewer: { liked: true, reposted: false, bookmarked: true, pinned: false, muted: false },
      replyTo: { id: '01HX0000000000000000000000', authorId: '109314567890123456' },
      tags: [{ name: 'garden', url: 'https://social.example/tags/garden' }],
      filters: [],
    });
    expect(post.repostedBy).toBeUndefined();
    expect((post.protocol === 'ap' ? post.raw?.ap.id : undefined)).toBe(post.id);
    expect(post.capabilities).toEqual({
      bookmark: true,
      edit: true,
      poll: true,
      visibility: true,
      pin: true,
      muteThread: true,
    });
  });

  it('keeps the content warning and the HTML renderer input', () => {
    const post = toPost(status());
    expect(post.contentWarning).toBe('Gardening');
    expect(post.content.kind).toBe('html');
    if (post.content.kind !== 'html') return;
    expect(post.content.html).toBe(statusFixture.content);
    expect(post.content.emojis).toEqual([
      { shortcode: 'blobcat', url: 'https://social.example/fileserver/emoji/blobcat.png' },
    ]);
    expect(contentToText(post.content)).toBe('Hello @bob :blobcat: see example.com #garden');
    expect(firstContentLink(post.content)).toBe('https://example.com/post?a=1&b=2');
  });

  it('treats an empty spoiler as no content warning', () => {
    expect(toPost(plain('1')).contentWarning).toBeUndefined();
  });

  it('normalises media', () => {
    const { media } = toPost(status());
    expect(media).toEqual([
      {
        id: '01HX00000000000000000000M1',
        kind: 'image',
        url: 'https://social.example/fileserver/media/original/1.jpg',
        previewUrl: 'https://social.example/fileserver/media/small/1.jpg',
        alt: 'A tomato plant',
        aspect: 1.7777,
        blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
        focus: { x: 0.25, y: -0.5 },
      },
      {
        id: '01HX00000000000000000000M2',
        kind: 'gifv',
        url: 'https://social.example/fileserver/media/original/2.mp4',
        previewUrl: 'https://social.example/fileserver/media/small/2.jpg',
        alt: undefined,
        aspect: 1.3333,
        blurhash: undefined,
        focus: undefined,
      },
    ]);
  });

  it('maps mentions to full handles and native account ids', () => {
    expect(toPost(status()).mentions).toEqual([
      { id: '109314567890123456', handle: 'bob@mastodon.example', url: 'https://mastodon.example/@bob' },
    ]);
  });

  it('maps the author with display-name fallback', () => {
    const post = toPost(status());
    expect(post.author).toMatchObject({
      uid: 'ap:01H8MJ1D3W2ZQ5F8K2J1N7C4VA',
      handle: 'alice',
      displayName: 'Alice :blobcat:',
      locked: false,
      counts: { posts: 421, following: 120, followers: 98 },
    });
    expect(post.author.note?.kind).toBe('html');

    const remote = toPost(status({ account: bob })).author;
    expect(remote).toMatchObject({ handle: 'bob@mastodon.example', displayName: 'bob', bot: true, locked: true });
    expect(remote.note).toBeUndefined();
  });

  it('keeps the poll and the card', () => {
    const post = toPost(status());
    expect(post.poll).toMatchObject({
      id: '01HX00000000000000000000P1',
      multiple: true,
      voted: true,
      ownVotes: [1],
      votesCount: 10,
      votersCount: 6,
      options: [{ title: 'Tomatoes :blobcat:', votesCount: 7 }, { title: 'Beans', votesCount: 3 }],
    });
    expect(post.card).toMatchObject({ url: 'https://example.com/post?a=1&b=2', title: 'A post', provider: 'Example' });
    expect(toPost(plain('2')).poll).toBeUndefined();
  });

  it('normalises a quote', () => {
    const quoted = plain('quoted', { account: bob });
    const post = toPost(plain('3', { quote: { state: 'accepted', quotedStatus: quoted } }));
    expect(post.quote).toMatchObject({ id: 'quoted', author: { handle: 'bob@mastodon.example' } });
    expect(toPost(plain('4', { quote: { state: 'pending', quotedStatusId: 'x' } })).quote).toBeUndefined();
  });

  it('normalises a reblog to the inner post with the booster and the wrapper', () => {
    const inner = plain('inner');
    const wrapper = plain('wrapper', {
      account: bob,
      createdAt: '2024-05-02T08:00:00.000Z',
      content: '',
      reblog: inner,
    });
    const post = toPost(wrapper);

    expect(post).toMatchObject({
      id: 'inner',
      uid: 'ap:inner',
      key: 'ap:inner:wrapper',
      cursor: 'wrapper',
      createdAt: inner.createdAt,
      sortAt: '2024-05-02T08:00:00.000Z',
      author: { handle: 'alice' },
      repostedBy: { handle: 'bob@mastodon.example', displayName: 'bob' },
    });
    expect((post.protocol === 'ap' ? post.raw?.ap.id : undefined)).toBe('inner');
    expect(post.wrapperId).toBe('wrapper');
  });

  it('gives the same post boosted twice distinct list keys but one uid', () => {
    const inner = plain('inner');
    const a = toPost(plain('w1', { reblog: inner }));
    const b = toPost(plain('w2', { account: bob, reblog: inner }));
    expect(a.uid).toBe(b.uid);
    expect(a.key).not.toBe(b.key);
  });

  it('turns filter matches into post filters, preferring the wrapper', () => {
    const match = (title: string, filterAction: string) => ({ filter: { title, filterAction }, keywordMatches: ['x'] });
    const inner = plain('inner', { filtered: [match('inner', 'hide')] as never });
    const post = toPost(plain('w', { reblog: inner, filtered: [match('Spoilers', 'warn')] as never }));
    expect(post.filters).toEqual([{ title: 'Spoilers', action: 'warn' }]);
    expect(toPost(inner).filters).toEqual([{ title: 'inner', action: 'hide' }]);
  });
});

const notification = (id: string, type: string, account: mastodon.v1.Account, extra: object = {}) =>
  ({ id, type, account, createdAt: '2024-05-02T10:00:00.000Z', groupKey: `ungrouped-${id}`, ...extra }) as unknown as Notification;

describe('toNotification', () => {
  it('maps types, author and post', () => {
    const like = toNotification(notification('n1', 'favourite', bob, { status: plain('s1') }));
    expect(like).toMatchObject({ id: 'n1', type: 'like', nativeType: 'favourite', author: { handle: 'bob@mastodon.example' }, post: { id: 's1' } });

    const types = ['mention', 'status', 'reblog', 'follow', 'follow_request', 'poll', 'update', 'admin.sign_up'].map(
      (t) => toNotification(notification('x', t, bob, t === 'follow' || t.startsWith('follow') || t.startsWith('admin') ? {} : { status: plain('s') })).type,
    );
    expect(types).toEqual(['mention', 'post', 'repost', 'follow', 'follow_request', 'poll', 'update', 'sign_up']);
  });

  it('has no post for follows', () => {
    expect(toNotification(notification('n2', 'follow', bob)).post).toBeUndefined();
  });
});

describe('groupNotifications', () => {
  const at = (hours: number) => new Date(Date.UTC(2024, 4, 2, 12 - hours)).toISOString();

  it('groups likes of one post, singles stay single, follows group within the window', () => {
    const s1 = plain('s1');
    const s2 = plain('s2');
    const items = groupNotifications(
      [
        notification('9', 'favourite', bob, { status: s1, createdAt: at(0) }),
        notification('8', 'favourite', alice, { status: s1, createdAt: at(0) }),
        notification('7', 'favourite', bob, { status: s2, createdAt: at(0) }),
        notification('6', 'mention', bob, { status: s2, createdAt: at(1) }),
        notification('5', 'follow', bob, { createdAt: at(1) }),
        notification('4', 'follow', alice, { createdAt: at(2) }),
        notification('3', 'follow', bob, { createdAt: at(20) }),
        notification('2', 'admin.sign_up', bob, { createdAt: at(21) }),
      ].map(toNotification),
    );

    expect(items.map((i) => [i.kind, i.key])).toEqual([
      ['group', 'like:s1'],
      ['single', '7'],
      ['single', '6'],
      ['group', 'follow:5'],
      ['single', '3'],
      ['single', '2'],
    ]);
    const first = items[0];
    expect(first.kind === 'group' && first.notifications.map((n) => n.id)).toEqual(['9', '8']);
  });
});

describe('toAuthor moved', () => {
  it('maps the account an author moved to', () => {
    expect(toAuthor(alice).moved).toBeUndefined();
    const moved = toAuthor({ ...alice, moved: bob } as unknown as mastodon.v1.Account);
    expect(moved.moved?.id).toBe(bob.id);
    expect(moved.moved?.handle).toBe(bob.acct);
  });
});
