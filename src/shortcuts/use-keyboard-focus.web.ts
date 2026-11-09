import { useCallback, useEffect, type RefObject } from 'react';

import { useTheme } from '@/hooks/use-theme';

import type { KeyboardFocus } from './definitions';
import { focusStatus, useFocusStore } from './focus-store';

const TEXT_FIELD = 'input,textarea,select,[contenteditable]';

export function useKeyboardFocus(id: string, ref: RefObject<{ focus?: () => void } | null>): KeyboardFocus {
  const theme = useTheme();
  const focused = useFocusStore((s) => s.focusedId === id);

  useEffect(() => {
    if (!focused || document.activeElement?.matches(TEXT_FIELD)) return;
    ref.current?.focus?.();
  }, [focused, ref]);

  const onFocus = useCallback<NonNullable<KeyboardFocus['onFocus']>>(
    (event) => {
      if (event.target === event.currentTarget) focusStatus(id);
    },
    [id],
  );

  return {
    onFocus,
    style: focused
      ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: theme.primary, outlineOffset: -2 }
      : undefined,
  };
}
