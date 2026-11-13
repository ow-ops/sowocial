import type { mastodon } from 'masto';

import { adminUrl, canModerate, detectServer } from '@/api/ap/server-detect';
import { toNotification, toPost } from '@/model/adapters/ap';
import { toAnnouncement } from '@/model/adapters/announcement';
import { applyReaction, toReactions } from '@/model/reaction';

import accountLocal from './fixtures/account-local.json';
import statusFixture from './fixtures/status.json';

const account = accountLocal as unknown as mastodon.v1.Account;
const notification = (extra: object) =>
  ({ id: '1', createdAt: '2025-01-01T00:00:00.000Z', account, status: null, ...extra }) as unknown as mastodon.v1.Notification;
const status = (extra: object) => ({ ...statusFixture, account, reblog: null, quote: null, ...extra }) as unknown as mastodon.v1.Status;

describe('notification mapping', () => {
  it('maps a moderation warning with its action and text', () => {
    const n = toNotification(
      notification({ type: 'moderation_warning', moderationWarning: { id: '9', action: 'silence', text: 'Be kind', appeal: null } }),
    );
    expect(n.type).toBe('moderation_warning');
    expect(n.detail).toEqual({ kind: 'warning', id: '9', action: 'silence', text: 'Be kind', appealed: false });
  });

  it('maps severed relationships counts', () => {
    const n = toNotification(
      notification({
        type: 'severed_relationships',
        event: { type: 'domain_block', targetName: 'bad.example', followersCount: 3, followingCount: 2, purged: false },
      }),
    );
    expect(n.type).toBe('severed');
    expect(n.detail).toMatchObject({ target: 'bad.example', followers: 3, following: 2 });
  });

  it('maps admin sign ups and reports', () => {
    expect(toNotification(notification({ type: 'admin.sign_up' })).type).toBe('sign_up');
    const report = toNotification(
      notification({ type: 'admin.report', report: { id: '5', comment: 'spam', targetAccount: account } }),
    );
    expect(report.type).toBe('report');
    expect(report.detail).toMatchObject({ kind: 'report', id: '5', comment: 'spam' });
  });

  it('maps Pleroma and Fedibird reactions', () => {
    const pleroma = toNotification(notification({ type: 'pleroma:emoji_reaction', emoji: '🎉', status: status({}) }));
    expect(pleroma.type).toBe('reaction');
    expect(pleroma.detail).toEqual({ kind: 'reaction', emoji: '🎉', url: undefined });
    const fedibird = toNotification(
      notification({ type: 'emoji_reaction', emojiReaction: { name: 'blob', url: 'https://x/blob.png' }, status: status({}) }),
    );
    expect(fedibird.detail).toEqual({ kind: 'reaction', emoji: 'blob', url: 'https://x/blob.png' });
  });

  it('keeps unknown types as other with their native type', () => {
    const n = toNotification(notification({ type: 'future_type' }));
    expect(n).toMatchObject({ type: 'other', nativeType: 'future_type' });
  });
});

describe('reactions', () => {
  it('reads the list from the top level or from the pleroma object', () => {
    const list = [{ name: '👍', count: 2, me: true }];
    expect(toPost(status({ emojiReactions: list })).reactions).toEqual([{ name: '👍', count: 2, me: true, url: undefined }]);
    expect(toPost(status({ pleroma: { emojiReactions: list } })).reactions).toHaveLength(1);
    expect(toPost(status({})).reactions).toBeUndefined();
  });

  it('drops empty entries', () => {
    expect(toReactions([{ name: '👍', count: 0 }])).toBeUndefined();
  });

  it('applies a toggle optimistically', () => {
    const base = [{ name: '👍', count: 1, me: false }];
    expect(applyReaction(base, '👍', true)).toEqual([{ name: '👍', count: 2, me: true }]);
    expect(applyReaction(applyReaction(base, '👍', true), '👍', false)).toEqual(base);
    expect(applyReaction(undefined, '🎉', true)).toEqual([{ name: '🎉', count: 1, me: true, url: undefined }]);
    expect(applyReaction([{ name: '🎉', count: 1, me: true }], '🎉', false)).toBeUndefined();
  });
});

describe('detectServer', () => {
  const instance = (extra: object) => ({ version: '4.3.0', ...extra }) as Parameters<typeof detectServer>[0];

  it('finds Akkoma and Pleroma reactions through the features list', () => {
    expect(detectServer(instance({ pleroma: { metadata: { features: ['pleroma_emoji_reactions'] } } })).reactions).toBe('pleroma');
  });

  it('finds Fedibird reactions through its capabilities', () => {
    expect(detectServer(instance({ fedibirdCapabilities: ['emoji_reaction'] })).reactions).toBe('fedibird');
  });

  it('shows nothing on vanilla Mastodon and GoToSocial', () => {
    expect(detectServer(instance({})).reactions).toBeUndefined();
    expect(detectServer(instance({ version: '0.19.0 git-abc' }))).toEqual({ software: 'gotosocial', quotes: false });
  });

  it('enables quote posts from Mastodon 4.5 on', () => {
    expect(detectServer(instance({ version: '4.4.9' })).quotes).toBe(false);
    expect(detectServer(instance({ version: '4.5.0' })).quotes).toBe(true);
    expect(detectServer(instance({ version: '4.10.0' })).quotes).toBe(true);
    expect(detectServer(instance({ version: '0.19.0 git-abc' })).quotes).toBe(false);
  });

  it('builds admin links per software', () => {
    expect(adminUrl('https://a.example', 'gotosocial', { kind: 'report', id: '7' })).toBe('https://a.example/settings/moderation/reports/7');
    expect(adminUrl('https://a.example', 'other', { kind: 'account', id: '8' })).toBe('https://a.example/admin/accounts/8');
  });

  it('lets only staff moderate, by permission bits on Mastodon and by role name on GoToSocial', () => {
    const role = (name: string, permissions: number) => ({ name, permissions }) as Parameters<typeof canModerate>[0];
    expect(canModerate(role('Owner', 1048575), 'other')).toBe(true);
    expect(canModerate(role('Moderator', 0x10), 'other')).toBe(true);
    expect(canModerate(role('Audit', 0x4), 'other')).toBe(false);
    expect(canModerate(role('user', 0), 'other')).toBe(false);
    expect(canModerate(role('moderator', 0), 'gotosocial')).toBe(true);
    expect(canModerate(role('user', 0), 'gotosocial')).toBe(false);
  });
});

describe('toAnnouncement', () => {
  it('maps content, read state and reactions', () => {
    const a = toAnnouncement({
      id: '1',
      content: '<p>Hi :blob:</p>',
      publishedAt: '2025-01-01T00:00:00.000Z',
      emojis: [{ shortcode: 'blob', url: 'https://x/b.png' }],
      reactions: [{ name: '👍', count: 1, me: false, url: '', staticUrl: '' }],
      read: true,
    } as unknown as mastodon.v1.Announcement);
    expect(a.read).toBe(true);
    expect(a.content).toMatchObject({ kind: 'html', emojis: [{ shortcode: 'blob' }] });
    expect(a.reactions).toHaveLength(1);
  });
});
