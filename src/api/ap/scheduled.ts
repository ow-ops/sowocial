import type { mastodon } from 'masto';

export const isScheduled = (s: mastodon.v1.Status | mastodon.v1.ScheduledStatus): s is mastodon.v1.ScheduledStatus =>
  'scheduledAt' in s;
