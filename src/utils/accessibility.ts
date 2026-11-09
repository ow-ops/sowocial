import { t } from '@/i18n';
import { contentToText } from '@/model/content';
import type { Post } from '@/model/post';
import { shortRelativeTime } from '@/utils/relative-time';

export function statusSummary(
  status: Post,
  { revealed = false, boostedBy }: { revealed?: boolean; boostedBy?: string } = {},
) {
  const shown = !status.contentWarning || revealed;
  const parts = [
    ...(boostedBy ? [t('a11y.boostedBy', { name: boostedBy })] : []),
    t('a11y.author', { name: status.author.displayName, acct: status.author.handle }),
    status.editedAt ? t('a11y.edited', { time: shortRelativeTime(status.createdAt) }) : shortRelativeTime(status.createdAt),
    ...(status.contentWarning ? [t('a11y.contentWarning', { text: status.contentWarning })] : []),
    ...(shown ? [contentToText(status.content)] : []),
  ];
  if (shown && status.media.length > 0) {
    parts.push(t('a11y.attachments', { count: status.media.length }));
  }
  if (status.poll) parts.push(t('a11y.poll'));
  const counts = [
    status.counts.replies > 0 && t('a11y.replies', { count: status.counts.replies }),
    status.counts.reposts > 0 && t('a11y.boosts', { count: status.counts.reposts }),
    status.counts.likes > 0 && t('a11y.favourites', { count: status.counts.likes }),
  ].filter(Boolean);
  return [...parts, ...counts].join('. ');
}
