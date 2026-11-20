import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { deleteDraft, saveDraft, type SavedDraft } from '@/utils/drafts';

const SAVE_DELAY_MS = 500;

// Saving rewrites every draft, so it waits for a pause in typing, and is forced when the screen loses focus or the app
// leaves the foreground. `baseline` is the text the form opened with, which does not make a draft worth keeping.
export function useComposeDraft(owner: string, draft: SavedDraft | null, baseline: string) {
  const latest = useRef(draft);
  const unsaved = useRef(false);
  const discarded = useRef(false);
  useEffect(() => {
    latest.current = draft;
  });

  const flush = useCallback(() => {
    if (!unsaved.current) return;
    unsaved.current = false;
    if (latest.current && !discarded.current) saveDraft(owner, latest.current, baseline);
  }, [owner, baseline]);

  const snapshot = JSON.stringify(draft);
  useEffect(() => {
    unsaved.current = true;
    const timer = setTimeout(flush, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [flush, snapshot]);
  useFocusEffect(useCallback(() => flush, [flush]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state !== 'active' && flush());
    return () => subscription.remove();
  }, [flush]);

  return () => {
    discarded.current = true;
    if (draft) deleteDraft(owner, draft.id);
  };
}
