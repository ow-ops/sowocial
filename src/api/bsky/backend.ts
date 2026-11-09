import type { Agent } from '@atproto/api';

import { resolveServices } from '@/auth/bsky-services';
import type { BskySession } from '@/auth/types';
import { t } from '@/i18n';
import { actionFields } from '../cache';
import { BSKY_CAPABILITIES } from '../backend/capabilities';
import type { Backend } from '../backend/types';
import { runToggle, reserveToggle } from './interactions';
import { bskyNotificationPage } from './notification-page';
import { createBskyPost } from './post';
import {
  bskyAuthorFeedPage,
  bskyFollowPages,
  bskyPost,
  bskyProfile,
  bskyRelationship,
  bskySearch,
  bskyThread,
  bskyTimelinePage,
  bskyUpdateRelationship,
} from './read';
import { createBskyReport } from './report';

const FOLLOW_PAGE_SIZE = 40;

const unavailable = () => new Error(t('status.actions.unavailable'));

export function createBskyBackend(session: BskySession, agent: Agent): Backend {
  return {
    protocol: 'bsky',
    capabilities: BSKY_CAPABILITIES,
    timelinePage: (timeline, cursor) => bskyTimelinePage(agent, timeline, cursor),
    getPost: (id) => bskyPost(agent, id),
    getThread: (id) => bskyThread(agent, id),
    reserveAction: (post, action) =>
      post.protocol === 'bsky' && action !== 'bookmark' ? reserveToggle(post, action) : !post.viewer[actionFields[action].flag],
    postAction: async (post, action, on) => {
      if (post.protocol !== 'bsky' || action === 'bookmark') throw unavailable();
      const uri = await runToggle(agent, post, action, on);
      const { flag, uri: field } = actionFields[action];
      return (current) => (current.viewer[flag] ? { ...current, viewer: { ...current.viewer, [field]: uri } } : current);
    },
    deletePost: async (post) => {
      if (post.protocol !== 'bsky') throw unavailable();
      await agent.deletePost(post.uri);
    },
    profile: (id) => bskyProfile(agent, id),
    profilePosts: async (id, filter, cursor) => (filter === 'pinned' ? [] : bskyAuthorFeedPage(agent, id, filter, cursor)),
    follows: (id, kind) => bskyFollowPages(agent, id, kind, FOLLOW_PAGE_SIZE),
    relationship: (id) => bskyRelationship(agent, id),
    setRelationship: (id, change) => bskyUpdateRelationship(agent, id, change),
    search: async (q) => ({ ...(await bskySearch(agent, q)), hashtags: [] }),
    resolveUrl: async () => null,
    notificationsPage: (filter, cursor) => bskyNotificationPage(agent, filter, cursor),
    unreadNotifications: async () => (await agent.countUnreadNotifications({})).data.count,
    post: async ({ status, parent, quote, media, video, onVideoProgress, language, label, interactions }, signal) => {
      await createBskyPost(
        agent,
        { text: status, parent, quote, media, video, pds: session.pds, onVideoProgress, language, label, interactions },
        signal,
      );
      return { kind: 'indexing' };
    },
    report: async ({ accountId, statusIds, comment, category, post }) => {
      const { moderation } = resolveServices(session);
      const [statusId] = statusIds ?? [];
      if (!statusId) {
        await createBskyReport(agent, category, comment, { did: accountId }, moderation);
        return;
      }
      const target = post ?? (await bskyPost(agent, statusId));
      if (target.protocol !== 'bsky') throw unavailable();
      await createBskyReport(agent, category, comment, { uri: target.uri, cid: target.cid }, moderation);
    },
  };
}
