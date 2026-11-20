import type { mastodon } from 'masto';

import type { Chain } from '@/api/compose-thread';
import type { MediaDraft, PollDraft, PostInteractions, SelfLabel, VideoDraft } from '@/api/backend/draft';
import { outboxFiles } from '@/api/outbox';
import { KEEPS_FILES, keepFile, pruneFiles, removeFile } from '@/utils/draft-files';
import { keysWithPrefix, readItem, removeItem, writeItem } from '@/utils/kv';
import { DRAFT_PREFIX, OUTBOX_KEY } from '@/utils/kv-keys';

export const AUTO_DRAFT = 'auto';

export type DraftSegment = { text: string; media: MediaDraft[]; video?: VideoDraft; poll?: PollDraft };

export type SavedDraft = {
  id: string;
  updatedAt: number;
  segments: DraftSegment[];
  warning: string;
  showWarning: boolean;
  visibility?: mastodon.v1.StatusVisibility;
  language?: string;
  replyTo?: string;
  quote?: string;
  chain?: Chain;
  selfLabel?: SelfLabel;
  interactions?: PostInteractions;
};

// All of an account's drafts share the key the single draft used before.
const key = (owner: string) => `${DRAFT_PREFIX}${owner}`;

type Legacy = { text: string; warning: string; showWarning: boolean; visibility?: SavedDraft['visibility']; language?: string };

export function loadDrafts(owner: string): SavedDraft[] {
  const raw = readItem(key(owner));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.drafts)) return parsed.drafts;
    const { text, ...rest } = parsed as Legacy;
    return [{ ...rest, id: AUTO_DRAFT, updatedAt: Date.now(), segments: [{ text, media: [] }] }];
  } catch {
    return [];
  }
}

export const getDraft = (owner: string, id: string) => loadDrafts(owner).find((d) => d.id === id) ?? null;

export const replaceDrafts = (owner: string, drafts: SavedDraft[]) =>
  drafts.length ? writeItem(key(owner), JSON.stringify({ v: 2, drafts })) : removeItem(key(owner));

const draftFiles = (draft: SavedDraft) =>
  draft.segments.flatMap((s) => [...s.media.map((m) => m.uri), ...(s.video ? [s.video.uri] : [])]);

// A draft that only holds the text it was opened with is not worth keeping.
const isDraftEmpty = (draft: SavedDraft, baseline = '') =>
  draft.segments.length === 1 &&
  draft.segments[0].text.trim() === baseline.trim() &&
  draft.segments[0].media.length === 0 &&
  !draft.segments[0].video &&
  !draft.segments[0].poll?.options.some((o) => o.trim()) &&
  !draft.warning.trim();

export function saveDraft(owner: string, draft: SavedDraft, baseline?: string) {
  const all = loadDrafts(owner);
  const previous = all.find((d) => d.id === draft.id);
  const keep: SavedDraft = {
    ...draft,
    segments: draft.segments.map((s) => ({
      ...s,
      media: KEEPS_FILES ? s.media.map((m) => ({ ...m, uri: keepFile(m.uri) })) : [],
      video: KEEPS_FILES && s.video ? { ...s.video, uri: keepFile(s.video.uri) } : undefined,
    })),
  };
  const empty = isDraftEmpty(keep, baseline);
  const kept = new Set(empty ? [] : draftFiles(keep));
  for (const uri of previous ? draftFiles(previous) : []) if (!kept.has(uri)) removeFile(uri);
  const others = all.filter((d) => d.id !== draft.id);
  if (empty) return previous && replaceDrafts(owner, others);
  replaceDrafts(owner, [{ ...keep, updatedAt: Date.now() }, ...others]);
}

export function deleteDraft(owner: string, id: string) {
  const all = loadDrafts(owner);
  const target = all.find((d) => d.id === id);
  if (!target) return;
  draftFiles(target).forEach(removeFile);
  replaceDrafts(owner, all.filter((d) => d.id !== id));
}

// Copies a crash left behind belong to no saved draft; every account's drafts and the outbox's pending posts count as referenced.
export function sweepDraftFiles() {
  if (!KEEPS_FILES) return;
  try {
    const referenced = new Set([
      ...keysWithPrefix(DRAFT_PREFIX).flatMap((k) => loadDrafts(k.slice(DRAFT_PREFIX.length)).flatMap(draftFiles)),
      ...outboxFiles({ read: () => readItem(OUTBOX_KEY), write: () => {} }),
    ]);
    pruneFiles(referenced);
  } catch (error) {
    console.warn('Draft cleanup failed', error);
  }
}
