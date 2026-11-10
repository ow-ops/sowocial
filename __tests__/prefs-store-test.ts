jest.mock('@/utils/kv', () => {
  const items = new Map<string, string>();
  return {
    readItem: (key: string) => items.get(key) ?? null,
    writeItem: (key: string, value: string) => void items.set(key, value),
  };
});

import { getPref, PREF_DEFAULTS, prefsStore, setPref } from '@/prefs/store';
import { readItem } from '@/utils/kv';
import { PREFS_KEY } from '@/utils/kv-keys';

describe('prefs store', () => {
  it('starts with the defaults', () => {
    expect(prefsStore.getState()).toEqual(PREF_DEFAULTS);
    expect(getPref('altReminder')).toBe(true);
  });

  it('updates one key and persists the whole record', () => {
    setPref('density', 'compact');
    expect(getPref('density')).toBe('compact');
    expect(getPref('textSize')).toBe('default');
    expect(JSON.parse(readItem(PREFS_KEY)!)).toMatchObject({ density: 'compact', haptics: true });
  });

  it('merges saved values over the defaults on load', () => {
    jest.resetModules();
    const kv = jest.requireMock('@/utils/kv');
    kv.writeItem(PREFS_KEY, JSON.stringify({ links: 'system' }));
    const fresh = jest.requireActual('@/prefs/store');
    expect(fresh.getPref('links')).toBe('system');
    expect(fresh.getPref('mediaAutoplay')).toBe('always');
  });
});
