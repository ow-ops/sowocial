import type { KeybindingsMap } from 'tinykeys';

import { SHORTCUT_GROUPS, type ShortcutAction } from './definitions';

export function buildBindings(handlers: Record<ShortcutAction, () => void>): KeybindingsMap {
  const entries = SHORTCUT_GROUPS.flatMap((group) =>
    group.shortcuts.flatMap(({ action, keys }) =>
      keys.map((key) => [key, (event: KeyboardEvent) => {
        event.preventDefault();
        handlers[action]();
      }] as const),
    ),
  );
  entries.sort(([a], [b]) => Number(b.includes(' ')) - Number(a.includes(' ')));
  return Object.fromEntries(entries);
}

export const isPlainBodyTarget = (event: KeyboardEvent) => event.target === document.body;
