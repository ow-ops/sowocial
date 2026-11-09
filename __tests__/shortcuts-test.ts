import { createKeybindingsHandler, defaultKeybindingsHandlerIgnore } from 'tinykeys';

import { isAvailable, SHORTCUT_GROUPS, type ShortcutAction } from '@/shortcuts/definitions';
import { stepIndex } from '@/shortcuts/focus-store';
import { buildBindings } from '@/shortcuts/keymap';

const actions = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts.map((s) => s.action));

function setup() {
  const fired: ShortcutAction[] = [];
  const handlers = Object.fromEntries(actions.map((a) => [a, () => fired.push(a)])) as unknown as Record<ShortcutAction, () => void>;
  const handler = createKeybindingsHandler(buildBindings(handlers), { ignore: defaultKeybindingsHandlerIgnore });
  const press = (key: string, init: Partial<{ shift: boolean; ctrl: boolean; meta: boolean; alt: boolean; target: unknown }> = {}) => {
    const target = init.target ?? { matches: () => false };
    handler({
      key,
      code: key,
      repeat: false,
      isComposing: false,
      target,
      currentTarget: {},
      preventDefault: jest.fn(),
      getModifierState: (m: string) =>
        ({ Shift: init.shift, Control: init.ctrl, Meta: init.meta, Alt: init.alt })[m] ?? false,
    } as unknown as Event);
  };
  return { fired, press };
}

describe('stepIndex', () => {
  const ids = ['a', 'b', 'c'];
  it('starts at the first post when nothing is focused', () => {
    expect(stepIndex(ids, null, 1)).toBe(0);
    expect(stepIndex(ids, null, -1)).toBe(0);
    expect(stepIndex(ids, 'gone', 1)).toBe(0);
  });
  it('moves and clamps at the ends', () => {
    expect(stepIndex(ids, 'a', 1)).toBe(1);
    expect(stepIndex(ids, 'c', 1)).toBe(2);
    expect(stepIndex(ids, 'a', -1)).toBe(0);
  });
  it('returns -1 for an empty list', () => {
    expect(stepIndex([], null, 1)).toBe(-1);
  });
});

describe('key bindings', () => {
  it('fires single keys and aliases', () => {
    const { fired, press } = setup();
    press('j');
    press('f');
    press('d');
    expect(fired).toEqual(['next', 'like', 'bookmark']);
  });

  it('resolves g sequences before the single key sharing their last press', () => {
    const { fired, press } = setup();
    press('g');
    press('l');
    press('l');
    press('g');
    press('n');
    expect(fired).toEqual(['goLocal', 'like', 'goNotifications']);
  });

  it('accepts punctuation with or without shift', () => {
    const { fired, press } = setup();
    press('?', { shift: true });
    press('/');
    press('/', { shift: true });
    expect(fired).toEqual(['help', 'search', 'search']);
  });

  it('ignores ctrl, meta and alt combinations', () => {
    const { fired, press } = setup();
    press('r', { ctrl: true });
    press('l', { meta: true });
    press('n', { alt: true });
    expect(fired).toEqual([]);
  });

  it('ignores keys typed into fields', () => {
    const { fired, press } = setup();
    press('j', { target: { matches: () => true } });
    expect(fired).toEqual([]);
  });
});

describe('isAvailable', () => {
  it('hides actions the active network does not support', () => {
    expect(isAvailable('bookmark', { protocol: 'bsky', mixed: true })).toBe(false);
    expect(isAvailable('goLocal', { protocol: 'bsky', mixed: true })).toBe(false);
    expect(isAvailable('bookmark', { protocol: 'ap', mixed: false })).toBe(true);
    expect(isAvailable('boost', { protocol: 'bsky', mixed: false })).toBe(true);
  });

  it('offers source cycling only when Mixed exists', () => {
    expect(isAvailable('cycleSource', { protocol: 'ap', mixed: false })).toBe(false);
    expect(isAvailable('cycleSource', { protocol: 'ap', mixed: true })).toBe(true);
  });
});
