import type { mastodon } from 'masto';

import { readItem, removeItem, writeItem } from '@/utils/kv';
import { DRAFT_PREFIX } from '@/utils/kv-keys';

export type SavedDraft = {
  text: string;
  warning: string;
  showWarning: boolean;
  visibility?: mastodon.v1.StatusVisibility;
  language?: string;
};

const key = (accountId: string) => `${DRAFT_PREFIX}${accountId}`;

export function loadDraft(accountId: string): SavedDraft | null {
  const raw = readItem(key(accountId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedDraft;
  } catch {
    return null;
  }
}

export function saveDraft(accountId: string, draft: SavedDraft) {
  if (!draft.text.trim() && !draft.warning.trim()) return removeItem(key(accountId));
  writeItem(key(accountId), JSON.stringify(draft));
}

export const clearDraft = (accountId: string) => removeItem(key(accountId));
