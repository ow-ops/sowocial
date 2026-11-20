import type { MediaDraft, VideoDraft } from '@/api/backend/draft';

type AltSegment = { media: MediaDraft[]; video?: VideoDraft | null };

// Uris of the attachments with no description, in posting order.
export const missingAlt = (segments: AltSegment[]): string[] =>
  segments.flatMap(({ media, video }) =>
    [...media, ...(video ? [video] : [])].filter((m) => !m.description.trim()).map((m) => m.uri),
  );
