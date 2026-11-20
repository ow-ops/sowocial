import type { ModerationCause, ModerationOpts } from '@atproto/api';

import { getBskyModeration } from '@/auth/bsky-loader';
import { intlLocale, t } from '@/i18n';

import type { Author, Post } from './post';

export type ModerationContext = 'contentList' | 'contentView';

type LabelCause = Extract<ModerationCause, { type: 'label' }>;

const KNOWN_LABELS = {
  porn: 'status.moderation.labels.porn',
  sexual: 'status.moderation.labels.sexual',
  nudity: 'status.moderation.labels.nudity',
  'graphic-media': 'status.moderation.labels.graphic-media',
  gore: 'status.moderation.labels.gore',
  '!hide': 'status.moderation.labels.hide',
  '!warn': 'status.moderation.labels.warn',
} as const;

const sameLanguage = (a: string, b: string) => a.split('-')[0] === b.split('-')[0];

function labelName({ label, labelDef }: LabelCause) {
  const own = labelDef.locales.find((l) => sameLanguage(l.lang, intlLocale()));
  if (own) return own.name;
  const known = KNOWN_LABELS[label.val as keyof typeof KNOWN_LABELS];
  if (known) return t(known);
  return labelDef.locales.find((l) => sameLanguage(l.lang, 'en'))?.name ?? labelDef.locales[0]?.name ?? label.val;
}

function causeName(cause: ModerationCause): string {
  switch (cause.type) {
    case 'label':
      return labelName(cause);
    case 'muted':
      return t('status.moderation.muted');
    case 'mute-word':
      return t('status.moderation.muteWord');
    case 'hidden':
      return t('status.moderation.hidden');
    default:
      return t('status.moderation.blocked');
  }
}

const names = (causes: ModerationCause[]) => [...new Set(causes.map(causeName))];

export function moderatedPost(post: Post, opts: ModerationOpts | undefined, context: ModerationContext = 'contentList'): Post {
  const moderation = getBskyModeration();
  if (!moderation || !opts || post.protocol !== 'bsky' || !post.raw) return post;
  const decision = moderation.moderatePost(post.raw.bsky, opts);
  const ui = decision.ui(context);
  const sensitive = decision.ui('contentMedia').blur;
  const hidden = names(ui.filters);
  const blurred = post.contentWarning ? [] : names(ui.blurs);
  const labels = names([...ui.alerts, ...ui.informs]);
  if (!hidden.length && !blurred.length && !labels.length && sensitive === post.sensitive) return post;
  return {
    ...post,
    sensitive,
    filters: hidden.length
      ? [...(post.filters ?? []), ...hidden.map((title) => ({ title, action: 'hide' as const }))]
      : post.filters,
    contentWarning: blurred.length ? blurred.join(', ') : post.contentWarning,
    labels: labels.length ? labels : undefined,
  };
}

export function profileModeration(author: Author, opts: ModerationOpts | undefined) {
  const moderation = getBskyModeration();
  if (!moderation || !opts || author.protocol !== 'bsky' || !author.raw) return { labels: [] as string[], blurAvatar: false };
  const decision = moderation.moderateProfile(author.raw.bsky, opts);
  const view = decision.ui('profileView');
  return {
    labels: names([...view.blurs, ...view.alerts, ...view.informs]),
    blurAvatar: decision.ui('avatar').blur,
  };
}
