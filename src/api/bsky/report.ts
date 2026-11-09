import type { Agent } from '@atproto/api';

import { DEFAULT_SERVICES, splitService } from '@/auth/bsky-services';

export const MODERATION_SERVICE = splitService(DEFAULT_SERVICES.moderation).did;

export type ReportCategory = 'spam' | 'violation' | 'other';

const REASON_TYPES = {
  spam: 'com.atproto.moderation.defs#reasonSpam',
  violation: 'com.atproto.moderation.defs#reasonViolation',
  other: 'com.atproto.moderation.defs#reasonOther',
} as const;

export type ReportTarget = { did: string } | { uri: string; cid: string };

export function buildReport(category: ReportCategory, comment: string, target: ReportTarget) {
  const reason = comment.trim();
  return {
    reasonType: REASON_TYPES[category],
    reason: reason || undefined,
    subject:
      'did' in target
        ? { $type: 'com.atproto.admin.defs#repoRef' as const, did: target.did }
        : { $type: 'com.atproto.repo.strongRef' as const, uri: target.uri, cid: target.cid },
  };
}

export function createBskyReport(
  agent: Agent,
  category: ReportCategory,
  comment: string,
  target: ReportTarget,
  service = DEFAULT_SERVICES.moderation,
) {
  const { did, type } = splitService(service);
  return agent.withProxy(type, did).com.atproto.moderation.createReport(buildReport(category, comment, target));
}
