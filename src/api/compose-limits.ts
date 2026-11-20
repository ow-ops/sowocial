import type { Session } from '@/auth/types';
import { countCharacters } from '@/utils/text';

import { capabilitiesFor } from './backend/capabilities';
import type { BackendCapabilities } from './backend/types';
import { graphemeCount, MAX_GRAPHEMES, MAX_IMAGES } from './bsky/compose';

export type PostLimits = { characters: number; reservedPerUrl: number; media: number };

export type InstanceStatuses = { maxCharacters: number; charactersReservedPerUrl: number; maxMediaAttachments: number };

// Without a fixed grapheme limit, an account's limits come from its server and are unknown until `statuses` has loaded.
export const limitsFromServer = ({ protocol }: Pick<Session, 'protocol'>) => !capabilitiesFor(protocol).graphemeLimit;

export function postLimits(capabilities: BackendCapabilities, statuses?: InstanceStatuses): PostLimits | undefined {
  if (capabilities.graphemeLimit) return { characters: MAX_GRAPHEMES, reservedPerUrl: 0, media: MAX_IMAGES };
  return (
    statuses && {
      characters: statuses.maxCharacters,
      reservedPerUrl: statuses.charactersReservedPerUrl,
      media: statuses.maxMediaAttachments,
    }
  );
}

export function charactersLeft(
  capabilities: BackendCapabilities,
  status: string,
  spoilerText: string,
  { characters, reservedPerUrl }: Pick<PostLimits, 'characters' | 'reservedPerUrl'>,
) {
  return capabilities.graphemeLimit
    ? characters - graphemeCount(status.trim())
    : characters - countCharacters(status + spoilerText, reservedPerUrl);
}
