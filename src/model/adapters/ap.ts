import type { mastodon } from 'masto';

import { htmlContent, pronounsFromFields } from '../content';
import { toReactions } from '../reaction';
import type {
  Author,
  Card,
  Emoji,
  Media,
  Notification,
  NotificationDetail,
  NotificationType,
  Poll,
  Post,
  PostFilter,
  PostingDefaults,
} from '../post';

const emoji = ({ shortcode, url }: mastodon.v1.CustomEmoji): Emoji => ({ shortcode, url });

type RoleLike = { name?: string; color?: string };

function accountRoles(account: mastodon.v1.Account): { name: string; color?: string }[] {
  const { roles, role } = account as unknown as { roles?: RoleLike[]; role?: RoleLike };
  return (roles?.length ? roles : role ? [role] : [])
    .filter((r): r is RoleLike & { name: string } => !!r.name)
    .map((r) => ({ name: r.name, color: r.color || undefined }));
}

export function toPostingDefaults({ source }: mastodon.v1.CredentialAccount): PostingDefaults {
  return { visibility: source.privacy ?? undefined, language: source.language || undefined, sensitive: !!source.sensitive };
}

export function toAuthor(account: mastodon.v1.Account): Author {
  const emojis = account.emojis.map(emoji);
  return {
    uid: `ap:${account.id}`,
    protocol: 'ap',
    id: account.id,
    handle: account.acct,
    username: account.username,
    displayName: account.displayName || account.username,
    avatar: account.avatar,
    header: account.header,
    emojis,
    bot: account.bot,
    locked: account.locked,
    fields: account.fields.map((f) => ({
      name: f.name,
      value: htmlContent(f.value, emojis),
      verifiedAt: f.verifiedAt ?? undefined,
    })),
    pronouns: pronounsFromFields(account.fields),
    roles: accountRoles(account),
    createdAt: account.createdAt,
    note: account.note ? htmlContent(account.note, emojis) : undefined,
    counts: { posts: account.statusesCount, following: account.followingCount, followers: account.followersCount },
    moved: account.moved ? toAuthor(account.moved) : undefined,
    url: account.url,
    raw: { ap: account },
  };
}

export function toMedia(m: mastodon.v1.MediaAttachment): Media {
  return {
    id: m.id,
    kind: m.type,
    url: m.url ?? null,
    previewUrl: m.previewUrl ?? null,
    alt: m.description ?? undefined,
    aspect: m.meta?.original?.aspect,
    blurhash: m.blurhash ?? undefined,
    focus: m.meta?.focus ?? undefined,
  };
}

export function toPoll(poll: mastodon.v1.Poll): Poll {
  return {
    id: poll.id,
    expiresAt: poll.expiresAt ?? undefined,
    expired: poll.expired,
    multiple: poll.multiple,
    votesCount: poll.votesCount,
    votersCount: poll.votersCount ?? undefined,
    voted: !!poll.voted,
    ownVotes: poll.ownVotes ?? [],
    options: poll.options.map((o) => ({ title: o.title, votesCount: o.votesCount, emojis: (o.emojis ?? []).map(emoji) })),
  };
}

function toCard(card: mastodon.v1.PreviewCard): Card {
  return {
    url: card.url,
    title: card.title,
    description: card.description,
    image: card.image ?? undefined,
    provider: card.providerName ?? undefined,
  };
}

// Akkoma and Pleroma nest the list under `pleroma`; Fedibird and newer Akkoma also send it at the top level.
function statusReactions(status: mastodon.v1.Status) {
  const { emojiReactions, pleroma } = status as unknown as {
    emojiReactions?: Parameters<typeof toReactions>[0];
    pleroma?: { emojiReactions?: Parameters<typeof toReactions>[0] };
  };
  return toReactions(emojiReactions ?? pleroma?.emojiReactions);
}

export function toPost(status: mastodon.v1.Status): Post {
  const inner = status.reblog ?? status;
  const wrapperId = status.reblog ? status.id : undefined;
  const uid = `ap:${inner.id}`;
  const emojis = inner.emojis.map(emoji);
  const quoted = inner.quote && 'quotedStatus' in inner.quote ? inner.quote.quotedStatus : undefined;
  const filters: PostFilter[] = (status.filtered ?? inner.filtered ?? []).map((m) => ({
    title: m.filter.title,
    action: m.filter.filterAction === 'hide' ? 'hide' : 'warn',
  }));

  return {
    uid,
    key: wrapperId ? `${uid}:${wrapperId}` : uid,
    cursor: status.id,
    id: inner.id,
    protocol: 'ap',
    author: toAuthor(inner.account),
    createdAt: inner.createdAt,
    sortAt: status.createdAt,
    content: htmlContent(inner.content, emojis),
    contentWarning: inner.spoilerText || undefined,
    sensitive: inner.sensitive,
    media: inner.mediaAttachments.map(toMedia),
    card: inner.card ? toCard(inner.card) : undefined,
    quote: quoted ? toPost(quoted) : undefined,
    repostedBy: wrapperId ? toAuthor(status.account) : undefined,
    wrapperId,
    replyTo: inner.inReplyToId
      ? { id: inner.inReplyToId, authorId: inner.inReplyToAccountId ?? undefined }
      : undefined,
    counts: { replies: inner.repliesCount, reposts: inner.reblogsCount, likes: inner.favouritesCount },
    reactions: statusReactions(inner),
    viewer: {
      liked: !!inner.favourited,
      reposted: !!inner.reblogged,
      bookmarked: !!inner.bookmarked,
      pinned: !!inner.pinned,
      muted: !!inner.muted,
    },
    visibility: inner.visibility,
    poll: inner.poll ? toPoll(inner.poll) : undefined,
    editedAt: inner.editedAt ?? undefined,
    emojis,
    tags: inner.tags.map(({ name, url }) => ({ name, url })),
    mentions: inner.mentions.map((m) => ({ id: m.id, handle: m.acct, url: m.url })),
    language: inner.language ?? undefined,
    url: inner.url ?? inner.uri,
    filters,
    capabilities: { bookmark: true, edit: true, poll: true, visibility: true, pin: true, muteThread: true },
    raw: { ap: inner },
  };
}

const NOTIFICATION_TYPES: Record<string, NotificationType> = {
  mention: 'mention',
  status: 'post',
  reblog: 'repost',
  favourite: 'like',
  follow: 'follow',
  follow_request: 'follow_request',
  poll: 'poll',
  update: 'update',
  quote: 'quote',
  quoted_update: 'quoted_update',
  'admin.sign_up': 'sign_up',
  'admin.report': 'report',
  severed_relationships: 'severed',
  moderation_warning: 'moderation_warning',
  'pleroma:emoji_reaction': 'reaction',
  emoji_reaction: 'reaction',
};

type ReactionFields = {
  emoji?: string;
  emojiUrl?: string;
  emojiReaction?: { name?: string; url?: string };
};

function notificationDetail(n: mastodon.v1.Notification): NotificationDetail | undefined {
  switch (n.type) {
    case 'moderation_warning': {
      const { id, action, text, appeal } = n.moderationWarning;
      return { kind: 'warning', id, action, text, appealed: !!appeal };
    }
    case 'severed_relationships': {
      const { type, targetName, followersCount, followingCount, purged } = n.event;
      return { kind: 'severed', event: type, target: targetName, followers: followersCount, following: followingCount, purged };
    }
    case 'admin.report':
      return { kind: 'report', id: n.report.id, target: toAuthor(n.report.targetAccount), comment: n.report.comment };
  }
  if (NOTIFICATION_TYPES[n.type] !== 'reaction') return undefined;
  const { emoji, emojiUrl, emojiReaction } = n as unknown as ReactionFields;
  const name = emoji ?? emojiReaction?.name;
  return name ? { kind: 'reaction', emoji: name, url: emojiUrl ?? emojiReaction?.url } : undefined;
}

export function toNotification(n: mastodon.v1.Notification): Notification {
  return {
    id: n.id,
    protocol: 'ap',
    type: NOTIFICATION_TYPES[n.type] ?? 'other',
    nativeType: n.type,
    author: toAuthor(n.account),
    post: n.status ? toPost(n.status) : undefined,
    detail: notificationDetail(n),
    createdAt: n.createdAt,
    raw: { ap: n },
  };
}
