import type { Session } from '@/auth/types';

import { capabilitiesFor } from './backend/capabilities';
import type { PostDraft } from './backend/draft';
import type { BackendCapabilities } from './backend/types';
import { charactersLeft, postLimits, type InstanceStatuses, type PostLimits } from './compose-limits';

export type CrossTarget = { capabilities: BackendCapabilities; limits: PostLimits };

export function crossTarget(session: Pick<Session, 'protocol'>, statuses?: InstanceStatuses): CrossTarget | undefined {
  const capabilities = capabilitiesFor(session.protocol);
  const limits = postLimits(capabilities, statuses);
  return limits && { capabilities, limits };
}

export type CrossBlock = 'visibility' | 'video' | 'media' | 'length';

export type CrossFit = { draft: PostDraft } | { blocked: CrossBlock };

export function fitCrossPost(draft: PostDraft, { capabilities: caps, limits }: CrossTarget): CrossFit {
  if (!caps.visibility && draft.visibility !== 'public') return { blocked: 'visibility' };
  if (draft.bsky?.video && !caps.video) return { blocked: 'video' };
  if (draft.media.length > limits.media) return { blocked: 'media' };

  const status = !caps.contentWarning && draft.spoilerText ? `CW: ${draft.spoilerText}\n${draft.status}` : draft.status;
  const spoilerText = caps.contentWarning ? draft.spoilerText : undefined;
  if (charactersLeft(caps, status, spoilerText ?? '', limits) < 0) return { blocked: 'length' };

  const { ap, bsky, ...rest } = draft;
  return {
    draft: {
      ...rest,
      status,
      spoilerText,
      media: caps.mediaFocus ? draft.media : draft.media.map(({ focus: _focus, ...media }) => media),
      sensitive: caps.selfLabels ? undefined : draft.sensitive,
      ...(caps.protocol === 'ap' ? { ap } : { bsky }),
    },
  };
}
