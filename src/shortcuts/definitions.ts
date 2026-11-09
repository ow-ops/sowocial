import type { NativeSyntheticEvent, TargetedEvent, ViewStyle } from 'react-native';

import { capabilitiesFor } from '@/api/backend/capabilities';
import type { Protocol } from '@/model/post';

export type ShortcutAction =
  | 'next'
  | 'previous'
  | 'open'
  | 'reply'
  | 'like'
  | 'boost'
  | 'bookmark'
  | 'compose'
  | 'cycleSource'
  | 'search'
  | 'top'
  | 'help'
  | 'back'
  | 'goHome'
  | 'goNotifications'
  | 'goLocal'
  | 'goSearch'
  | 'goProfile';

export type Shortcut = { action: ShortcutAction; keys: string[] };

export type ShortcutGroup = { id: 'posts' | 'app' | 'go'; shortcuts: Shortcut[] };

export type KeyboardFocus = {
  onFocus?: (event: NativeSyntheticEvent<TargetedEvent>) => void;
  style?: ViewStyle;
};

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'posts',
    shortcuts: [
      { action: 'next', keys: ['j'] },
      { action: 'previous', keys: ['k'] },
      { action: 'open', keys: ['o', 'Enter'] },
      { action: 'reply', keys: ['r'] },
      { action: 'like', keys: ['l', 'f'] },
      { action: 'boost', keys: ['b'] },
      { action: 'bookmark', keys: ['s', 'd'] },
    ],
  },
  {
    id: 'app',
    shortcuts: [
      { action: 'compose', keys: ['n', 'c'] },
      { action: 'cycleSource', keys: ['m'] },
      { action: 'search', keys: ['[Shift]+/'] },
      { action: 'top', keys: ['[Shift]+.'] },
      { action: 'help', keys: ['[Shift]+?'] },
      { action: 'back', keys: ['Escape'] },
    ],
  },
  {
    id: 'go',
    shortcuts: [
      { action: 'goHome', keys: ['g h'] },
      { action: 'goNotifications', keys: ['g n'] },
      { action: 'goLocal', keys: ['g l'] },
      { action: 'goSearch', keys: ['g s'] },
      { action: 'goProfile', keys: ['g p'] },
    ],
  },
];

export type ShortcutContext = { protocol: Protocol; mixed: boolean };

const AVAILABLE: Partial<Record<ShortcutAction, (context: ShortcutContext) => boolean>> = {
  bookmark: ({ protocol }) => capabilitiesFor(protocol).bookmarks,
  goLocal: ({ protocol }) => capabilitiesFor(protocol).localTimeline,
  cycleSource: ({ mixed }) => mixed,
};

export const isAvailable = (action: ShortcutAction, context: ShortcutContext) => AVAILABLE[action]?.(context) ?? true;

export const KEY_LABELS: Record<string, string> = { Escape: 'Esc', '[Shift]+/': '/', '[Shift]+.': '.', '[Shift]+?': '?' };

export const keyLabel = (key: string) => KEY_LABELS[key] ?? key;
