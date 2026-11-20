import type { mastodon } from 'masto';

import type { ApSession } from '@/auth/types';
import { t } from '@/i18n';
import { toAuthor, toNotification, toPost } from '@/model/adapters/ap';
import { pageOf } from '@/model/page';
import type { Post } from '@/model/post';
import { fullHandle } from '@/utils/acct';
import { looksLikeFediverseUrl } from '@/utils/links';

import { actionFields } from '../cache';
import { AP_CAPABILITIES } from '../backend/capabilities';
import type { Backend, UserList } from '../backend/types';
import type { Masto } from '../clients';
import type { NotificationFilter, Timeline } from '../keys';
import { PAGE_SIZE } from '../pagination';
import { toPollParams } from './poll';
import { updateApProfile } from './profile';
import { isScheduled } from './scheduled';
import { fediverseSearchQuery, hasPostFilters } from './search-query';
import { uploadMedia } from './upload';

const FOLLOW_PAGE_SIZE = 40;

const NOTIFICATION_TYPES: Record<NotificationFilter, mastodon.v1.NotificationType[] | undefined> = {
  all: undefined,
  mentions: ['mention'],
  follows: ['follow', 'follow_request'],
};

const PROFILE_PARAMS = {
  posts: { excludeReplies: true },
  replies: {},
  media: { onlyMedia: true },
  pinned: { pinned: true },
} as const;

const toList = ({ id, title, repliesPolicy, exclusive }: mastodon.v1.List): UserList => ({ id, title, repliesPolicy, exclusive });

const unavailable = () => new Error(t('status.actions.unavailable'));

async function* mapPages<T, R>(pages: AsyncIterable<T[]>, convert: (item: T) => R): AsyncGenerator<R[]> {
  for await (const page of pages) yield page.map(convert);
}

export async function fetchTimelinePage(
  timelines: Masto['v1']['timelines'],
  timeline: Timeline,
  params: { maxId?: string; minId?: string },
) {
  const page = { limit: PAGE_SIZE, ...params };
  const statuses = await (timeline === 'home'
    ? timelines.home.list(page)
    : timeline === 'local'
      ? timelines.public.list({ ...page, local: true })
      : timeline === 'public'
        ? timelines.public.list({ ...page, local: false })
        : timelines.tag.$select(timeline.tag).list(page));
  return statuses.map(toPost);
}

const postPage = (posts: Post[]) => pageOf(posts, posts.at(-1)?.cursor);

export function createApBackend(session: ApSession, masto: Masto): Backend {
  return {
    protocol: 'ap',
    capabilities: AP_CAPABILITIES,
    timelinePage: async (timeline, cursor) => postPage(await fetchTimelinePage(masto.v1.timelines, timeline, { maxId: cursor })),
    getPost: async (id) => toPost(await masto.v1.statuses.$select(id).fetch()),
    getThread: async (id) => {
      const { ancestors, descendants } = await masto.v1.statuses.$select(id).context.fetch();
      return { ancestors: ancestors.map(toPost), descendants: descendants.map(toPost) };
    },
    reserveAction: (post, action) => !post.viewer[actionFields[action].flag],
    postAction: async (post, action, on) => {
      if (post.protocol !== 'ap') throw unavailable();
      const s = masto.v1.statuses.$select(post.id);
      const result = await (() => {
        switch (action) {
          case 'favourite':
            return on ? s.favourite() : s.unfavourite();
          case 'reblog':
            return on ? s.reblog() : s.unreblog();
          case 'bookmark':
            return on ? s.bookmark() : s.unbookmark();
        }
      })();
      // Reblogging returns the new wrapper status; the original is inside it.
      const updated = toPost(result.reblog?.id === post.id ? result.reblog : result);
      return () => updated;
    },
    deletePost: async (post) => {
      await masto.v1.statuses.$select(post.id).remove();
    },
    profile: async (id) => toAuthor(await masto.v1.accounts.$select(id).fetch()),
    profilePosts: async (id, filter, cursor) =>
      postPage((await masto.v1.accounts.$select(id).statuses.list({ limit: PAGE_SIZE, maxId: cursor, ...PROFILE_PARAMS[filter] })).map(toPost)),
    follows: (id, kind) => mapPages(masto.v1.accounts.$select(id)[kind].list({ limit: FOLLOW_PAGE_SIZE }), toAuthor),
    interactions: (id, kind) => {
      const status = masto.v1.statuses.$select(id);
      return mapPages(kind === 'likes' ? status.favouritedBy.list() : status.rebloggedBy.list(), toAuthor);
    },
    relationship: async (id) => (await masto.v1.accounts.relationships.fetch({ id: [id] }))[0] ?? null,
    setRelationship: (id, change, options) => {
      const account = masto.v1.accounts.$select(id);
      return change === 'mute' && options ? account.mute(options) : account[change]();
    },
    search: async (q, filters) => {
      const [people, posts] = await Promise.all([
        masto.v2.search.list({ q, resolve: true, limit: 20 }),
        hasPostFilters(filters)
          ? masto.v2.search.list({ q: fediverseSearchQuery(q, filters), type: 'statuses', resolve: true, limit: 20 })
          : undefined,
      ]);
      return { accounts: people.accounts.map(toAuthor), hashtags: people.hashtags, statuses: (posts ?? people).statuses.map(toPost) };
    },
    findByHandle: async (handle) => {
      const { accounts } = await masto.v2.search.list({ q: handle, resolve: true, limit: 20 });
      const host = new URL(session.instance).host;
      return accounts.map(toAuthor).find((a) => fullHandle(a.handle, host).toLowerCase() === handle.toLowerCase()) ?? null;
    },
    resolvesUrl: looksLikeFediverseUrl,
    resolveUrl: async (url, signal) => {
      const result = await masto.v2.search.list({ q: url, resolve: true, limit: 1 }, { requestInit: { signal } });
      if (result.statuses[0]) return { type: 'status', id: result.statuses[0].id };
      if (result.accounts[0]) return { type: 'account', id: result.accounts[0].id };
      return null;
    },
    notificationsPage: async (filter, cursor) => {
      const notifications = await masto.v1.notifications.list({ limit: PAGE_SIZE, maxId: cursor, types: NOTIFICATION_TYPES[filter] });
      return pageOf(notifications.map(toNotification), notifications.at(-1)?.id);
    },
    unreadNotifications: async () => 0,
    post: async (draft, signal) => {
      const { media, editId, quote, poll, idempotencyKey, status, spoilerText, visibility, inReplyToId, language, sensitive } = draft;
      const { gts, keepMediaIds = [], mediaAttributes } = draft.ap ?? {};
      const params = { status, spoilerText, visibility, inReplyToId, language, sensitive };
      const uploaded = await Promise.all(media.map((m) => uploadMedia(masto, session, m, signal)));
      const mediaIds = [...keepMediaIds, ...uploaded];
      if (editId) {
        // Servers delete the poll when an edit omits it.
        const edited = await masto.v1.statuses
          .$select(editId)
          .update(poll ? { status, spoilerText, poll: toPollParams(poll) } : { status, spoilerText, mediaIds, mediaAttributes }, { requestInit: { signal } });
        return { kind: 'edited', post: toPost(edited) };
      }
      // A new post takes no media attributes, so a re-drafted attachment's description is updated on its own.
      await Promise.all((mediaAttributes ?? []).map(({ id, description }) => masto.v1.media.$select(id).update({ description }, { requestInit: { signal } })));
      // masto sends unknown keys through, so GoToSocial's extra fields need no wrapper.
      const created = await masto.v1.statuses.create(
        poll
          ? { ...params, quotedStatusId: quote?.id, poll: toPollParams(poll), ...gts }
          : { ...params, quotedStatusId: quote?.id, mediaIds, ...gts },
        { requestInit: { signal, ...(idempotencyKey && { headers: { 'Idempotency-Key': idempotencyKey } }) } },
      );
      if (isScheduled(created)) return { kind: 'scheduled' };
      return { kind: 'created', reply: !!created.inReplyToId, id: created.id };
    },
    checkVideo: async () => {
      throw unavailable();
    },
    report: async ({ accountId, statusIds, comment, forward, category }) => {
      await masto.v1.reports.create({ accountId, statusIds, comment, forward, category });
    },
    editableProfile: async () => {
      const { displayName, source, avatar, header, locked, bot } = await masto.v1.accounts.verifyCredentials();
      return {
        displayName,
        note: source.note,
        avatar,
        header,
        locked: !!locked,
        bot: !!bot,
        fields: source.fields.map(({ name, value }) => ({ name, value })),
      };
    },
    updateProfile: (edit) => updateApProfile(session, edit),
    bookmarksPage: async () => {
      throw unavailable();
    },
    suggestedFollows: async () => [],
    setPinned: async ({ id }, pinned) => {
      const s = masto.v1.statuses.$select(id);
      await (pinned ? s.pin() : s.unpin());
    },
    lists: async () => (await masto.v1.lists.list()).map(toList),
    list: async (id) => toList(await masto.v1.lists.$select(id).fetch()),
    listTimelinePage: async (id, cursor) =>
      postPage((await masto.v1.timelines.list.$select(id).list({ limit: PAGE_SIZE, maxId: cursor })).map(toPost)),
    // Limit 0 asks GoToSocial for every member in one response.
    listMembers: async (id) => (await masto.v1.lists.$select(id).accounts.list({ limit: 0 })).map(toAuthor),
    // masto's typings predate GoToSocial's replies policy, which it still serializes.
    createList: async (settings) => toList(await masto.v1.lists.create(settings)),
    updateList: async (id, settings) => toList(await masto.v1.lists.$select(id).update(settings)),
    deleteList: async (id) => {
      await masto.v1.lists.$select(id).remove();
    },
    setListMember: async (id, accountId, member) => {
      const accounts = masto.v1.lists.$select(id).accounts;
      await (member ? accounts.create({ accountIds: [accountId] }) : accounts.remove({ accountIds: [accountId] }));
    },
    listCandidates: async (q) => (await masto.v1.accounts.search.list({ q, following: true, limit: 10 })).map(toAuthor),
  };
}
