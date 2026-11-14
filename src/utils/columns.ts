import type { BackendCapabilities } from '@/api/backend/types';
import { DeckColumnWidth } from '@/constants/theme';
import { readItem, writeItem } from '@/utils/kv';
import { HOME_COLUMNS_PREFIX } from '@/utils/kv-keys';

export const FIXED_KINDS = ['home', 'local', 'notifications'] as const;
export const KEYED_KINDS = ['list', 'feed', 'tag'] as const;
type FixedKind = (typeof FIXED_KINDS)[number];
export type KeyedKind = (typeof KEYED_KINDS)[number];
export type ColumnKind = FixedKind | KeyedKind;

// `id` is the list id, the feed uri or the tag name; fixed kinds carry none.
export type Column = { kind: FixedKind } | { kind: KeyedKind; id: string };

const MIN_COLUMNS = 2;

type Caps = Pick<BackendCapabilities, 'localTimeline' | 'lists' | 'feeds' | 'tags'>;

export const columnKindsFor = (caps: Caps): ColumnKind[] => [
  'home',
  ...(caps.localTimeline ? (['local'] as const) : []),
  'notifications',
  ...(caps.lists ? (['list'] as const) : []),
  ...(caps.feeds ? (['feed'] as const) : []),
  ...(caps.tags ? (['tag'] as const) : []),
];

const isKeyed = (kind: ColumnKind): kind is KeyedKind => (KEYED_KINDS as readonly string[]).includes(kind);

export const columnId = (column: Column) => ('id' in column ? column.id : '');

export const columnKey = (column: Column) => `${column.kind}:${columnId(column)}`;

export const defaultColumns = (allowed: readonly ColumnKind[]): Column[] =>
  (['home', 'notifications'] as const).filter((kind) => allowed.includes(kind)).map((kind) => ({ kind }));

function validColumn(entry: unknown, allowed: readonly ColumnKind[]): Column | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const { kind: saved, id } = entry as { kind?: unknown; id?: unknown };
  const kind = allowed.find((k) => k === saved);
  if (!kind) return null;
  if (!isKeyed(kind)) return { kind };
  return typeof id === 'string' && id !== '' ? { kind, id } : null;
}

export function parseColumns(raw: string | null, allowed: readonly ColumnKind[]): Column[] {
  let saved: unknown = null;
  try {
    saved = JSON.parse(raw ?? 'null');
  } catch {
    // unreadable: fall through to the defaults
  }
  if (!Array.isArray(saved)) return defaultColumns(allowed);
  const seen = new Set<string>();
  const columns: Column[] = [];
  for (const entry of saved) {
    const column = validColumn(entry, allowed);
    if (column && !seen.has(columnKey(column))) {
      seen.add(columnKey(column));
      columns.push(column);
    }
  }
  return columns;
}

export const addColumn = (columns: Column[], column: Column) =>
  columns.some((c) => columnKey(c) === columnKey(column)) ? columns : [...columns, column];

export const removeColumn = (columns: Column[], column: Column) =>
  columns.filter((c) => columnKey(c) !== columnKey(column));

export function moveColumn(columns: Column[], column: Column, delta: 1 | -1): Column[] {
  const index = columns.findIndex((c) => columnKey(c) === columnKey(column));
  const target = index + delta;
  if (index === -1 || target < 0 || target >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// The column that takes keyboard shortcuts: the one last clicked or focused, else the first.
export function activeColumnKey(columns: Column[], active: string | null): string | null {
  if (active !== null && columns.some((c) => columnKey(c) === active)) return active;
  return columns[0] ? columnKey(columns[0]) : null;
}

const columnCount = (width: number) => Math.floor(width / DeckColumnWidth);

export const showColumns = (width: number) => columnCount(width) >= MIN_COLUMNS;

export const readColumns = (account: string, allowed: readonly ColumnKind[]) =>
  parseColumns(readItem(HOME_COLUMNS_PREFIX + account), allowed);

export const saveColumns = (account: string, columns: Column[]) =>
  writeItem(HOME_COLUMNS_PREFIX + account, JSON.stringify(columns));
