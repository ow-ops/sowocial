import {
  activeColumnKey,
  addColumn,
  columnKindsFor,
  defaultColumns,
  moveColumn,
  parseColumns,
  readColumns,
  removeColumn,
  saveColumns,
  showColumns,
  type Column,
  type ColumnKind,
} from '@/utils/columns';
import { readItem, writeItem } from '@/utils/kv';
import { HOME_COLUMNS_PREFIX } from '@/utils/kv-keys';

jest.mock('@/utils/kv', () => {
  const items = new Map<string, string>();
  return {
    readItem: (key: string) => items.get(key) ?? null,
    writeItem: (key: string, value: string) => void items.set(key, value),
  };
});

const ALL: ColumnKind[] = ['home', 'local', 'notifications', 'list', 'feed', 'tag'];
const HOME: Column = { kind: 'home' };
const NOTIFICATIONS: Column = { kind: 'notifications' };
const LOCAL: Column = { kind: 'local' };
const LIST_A: Column = { kind: 'list', id: 'a' };
const LIST_B: Column = { kind: 'list', id: 'b' };
const TAG: Column = { kind: 'tag', id: 'rust' };

describe('column kinds', () => {
  it('offers each kind only when the backend supports it', () => {
    expect(columnKindsFor({ localTimeline: true, lists: true, feeds: true, tags: true })).toEqual(ALL);
    expect(columnKindsFor({ localTimeline: false, lists: false, feeds: false, tags: false })).toEqual([
      'home',
      'notifications',
    ]);
  });

  it('defaults to home and notifications', () => {
    expect(defaultColumns(ALL)).toEqual([HOME, NOTIFICATIONS]);
    expect(defaultColumns(['local'])).toEqual([]);
  });
});

describe('parseColumns', () => {
  it('falls back to the defaults for missing or broken data', () => {
    expect(parseColumns(null, ALL)).toEqual([HOME, NOTIFICATIONS]);
    expect(parseColumns('not json', ALL)).toEqual([HOME, NOTIFICATIONS]);
    expect(parseColumns('{"home":true}', ALL)).toEqual([HOME, NOTIFICATIONS]);
  });

  it('drops kinds the account lacks, unknown kinds and malformed entries', () => {
    const raw = JSON.stringify([LOCAL, { kind: 'bogus' }, 'home', null, HOME]);
    expect(parseColumns(raw, ['home', 'notifications'])).toEqual([HOME]);
  });

  it('keeps keyed columns only with a non-empty id', () => {
    const raw = JSON.stringify([LIST_A, { kind: 'list' }, { kind: 'list', id: '' }, TAG, { kind: 'feed', id: 3 }]);
    expect(parseColumns(raw, ALL)).toEqual([LIST_A, TAG]);
  });

  it('drops duplicates of the same kind and id but keeps other ids of that kind', () => {
    const raw = JSON.stringify([LIST_A, LIST_A, LIST_B, HOME, HOME]);
    expect(parseColumns(raw, ALL)).toEqual([LIST_A, LIST_B, HOME]);
  });

  it('keeps an empty set the user chose', () => {
    expect(parseColumns('[]', ALL)).toEqual([]);
  });
});

describe('column edits', () => {
  it('adds a column once, at the end, and treats other ids as new', () => {
    const columns = addColumn([HOME], LIST_A);
    expect(columns).toEqual([HOME, LIST_A]);
    expect(addColumn(columns, LIST_A)).toBe(columns);
    expect(addColumn(columns, LIST_B)).toEqual([HOME, LIST_A, LIST_B]);
  });

  it('removes only the matching kind and id', () => {
    expect(removeColumn([HOME, LIST_A, LIST_B], LIST_A)).toEqual([HOME, LIST_B]);
  });

  it('moves a column one place left or right and stops at the edges', () => {
    const columns = [HOME, LOCAL, NOTIFICATIONS];
    expect(moveColumn(columns, LOCAL, -1)).toEqual([LOCAL, HOME, NOTIFICATIONS]);
    expect(moveColumn(columns, LOCAL, 1)).toEqual([HOME, NOTIFICATIONS, LOCAL]);
    expect(moveColumn(columns, HOME, -1)).toBe(columns);
    expect(moveColumn(columns, NOTIFICATIONS, 1)).toBe(columns);
  });
});

describe('active column', () => {
  it('is the first column until another one is picked', () => {
    expect(activeColumnKey([HOME, LIST_A], null)).toBe('home:');
    expect(activeColumnKey([HOME, LIST_A], 'list:a')).toBe('list:a');
  });

  it('falls back to the first column when the picked one was removed', () => {
    expect(activeColumnKey([HOME, LIST_B], 'list:a')).toBe('home:');
    expect(activeColumnKey([], 'home:')).toBeNull();
  });
});

describe('width', () => {
  it('shows columns only when two fit', () => {
    expect(showColumns(1279)).toBe(false);
    expect(showColumns(1280)).toBe(true);
  });
});

describe('saved columns', () => {
  it('stores the set per account', () => {
    saveColumns('acct-a', [LOCAL, TAG]);
    saveColumns('acct-b', [HOME, NOTIFICATIONS]);
    expect(readItem(`${HOME_COLUMNS_PREFIX}acct-a`)).toBe('[{"kind":"local"},{"kind":"tag","id":"rust"}]');
    expect(readColumns('acct-a', ALL)).toEqual([LOCAL, TAG]);
    expect(readColumns('acct-b', ALL)).toEqual([HOME, NOTIFICATIONS]);
    expect(readColumns('acct-c', ALL)).toEqual([HOME, NOTIFICATIONS]);
    writeItem(`${HOME_COLUMNS_PREFIX}acct-a`, '[{"kind":"notifications"},{"kind":"nope"}]');
    expect(readColumns('acct-a', ALL)).toEqual([NOTIFICATIONS]);
  });
});
