import type { mastodon } from 'masto';

import type { Announcement } from '../announcement';
import { htmlContent } from '../content';
import { toReactions } from '../reaction';

export function toAnnouncement(a: mastodon.v1.Announcement): Announcement {
  // masto's entity omits `read`, which servers send to signed-in users.
  const { read } = a as mastodon.v1.Announcement & { read?: boolean };
  return {
    id: a.id,
    content: htmlContent(a.content, a.emojis.map(({ shortcode, url }) => ({ shortcode, url }))),
    publishedAt: a.publishedAt,
    read: !!read,
    reactions: toReactions(a.reactions) ?? [],
  };
}
