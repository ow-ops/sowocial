import type { Session } from '@/auth/types';
import { countCharacters } from '@/utils/text';

import { capabilitiesFor } from './backend/capabilities';
import type { BackendCapabilities, PostDraft } from './backend/types';
import { graphemeCount, MAX_GRAPHEMES, MAX_IMAGES } from './bsky/compose';

export type CrossTarget = {
  capabilities: BackendCapabilities;
  limits: { characters: number; reservedPerUrl: number; media: number };
};

type InstanceStatuses = { maxCharacters: number; charactersReservedPerUrl: number; maxMediaAttachments: number };

// Without a fixed grapheme limit, an account's limits come from its server and are unknown until `statuses` has loaded.
export const limitsFromServer = ({ protocol }: Pick<Session, 'protocol'>) => !capabilitiesFor(protocol).graphemeLimit;

export function crossTarget(session: Pick<Session, 'protocol'>, statuses?: InstanceStatuses): CrossTarget | undefined {
  const capabilities = capabilitiesFor(session.protocol);
  if (!limitsFromServer(session)) return { capabilities, limits: { characters: MAX_GRAPHEMES, reservedPerUrl: 0, media: MAX_IMAGES } };
  return (
    statuses && {
      capabilities,
      limits: { characters: statuses.maxCharacters, reservedPerUrl: statuses.charactersReservedPerUrl, media: statuses.maxMediaAttachments },
    }
  );
}

export type CrossBlock = 'visibility' | 'video' | 'media' | 'length';

export type CrossFit = { draft: PostDraft } | { blocked: CrossBlock };

export function fitCrossPost(draft: PostDraft, { capabilities: caps, limits }: CrossTarget): CrossFit {
  if (!caps.visibility && draft.visibility !== 'public') return { blocked: 'visibility' };
  if (draft.video && !caps.video) return { blocked: 'video' };
  if (draft.media.length > limits.media) return { blocked: 'media' };

  const status = !caps.contentWarning && draft.spoilerText ? `CW: ${draft.spoilerText}\n${draft.status}` : draft.status;
  const spoilerText = caps.contentWarning ? draft.spoilerText : undefined;
  const left = caps.graphemeLimit
    ? limits.characters - graphemeCount(status.trim())
    : limits.characters - countCharacters(status + (spoilerText ?? ''), limits.reservedPerUrl);
  if (left < 0) return { blocked: 'length' };

  return {
    draft: {
      ...draft,
      status,
      spoilerText,
      media: caps.mediaFocus ? draft.media : draft.media.map(({ focus: _focus, ...media }) => media),
      sensitive: caps.selfLabels ? undefined : draft.sensitive,
      gts: caps.visibility ? draft.gts : undefined,
      label: caps.selfLabels ? draft.label : undefined,
      interactions: caps.interactionControls ? draft.interactions : undefined,
    },
  };
}
