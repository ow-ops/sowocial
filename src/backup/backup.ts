import { REPLY_AUDIENCES, SELF_LABELS, type PostInteractions } from '@/api/bsky/compose';
import type { PollDraft } from '@/api/backend/types';
import { isHomeSource, VISIBILITIES, type HomeSource } from '@/model/post';
import { PREF_DEFAULTS, PREF_OPTIONS, type Prefs } from '@/prefs/store';
import { APPEARANCES, type CustomTheme, type CustomTweak, type ThemeState } from '@/theme/store';
import { parseThemeFile, type ThemeKind } from '@/theme/theme-file';
import type { DraftSegment, SavedDraft } from '@/utils/drafts';

const BACKUP_FORMAT = 'sowocial-backup';
export const BACKUP_VERSION = 1;

const RECENT_LIMIT = 8;
const DRAFT_LIMIT = 50;
const KINDS: ThemeKind[] = ['light', 'dark'];
const OWNER = /^[\w.-]{1,200}$/;

export type Snapshot = {
  prefs: Prefs;
  theme: ThemeState;
  homeSource: HomeSource | null;
  drafts: Record<string, SavedDraft[]>;
  recentSearches: Record<string, string[]>;
};

export type BackupError = 'format' | 'newer' | 'invalid';

export type Restore = { error: BackupError } | { snapshot: Snapshot };

type BackupSegment = Pick<DraftSegment, 'text' | 'poll'>;

// The part of a draft that goes into a backup: no media, no thread position.
type BackupDraft = Omit<SavedDraft, 'segments' | 'chain'> & { segments: BackupSegment[] };

type Incoming = Omit<Snapshot, 'drafts'> & { drafts: Record<string, BackupDraft[]> };

const hasText = (draft: SavedDraft) =>
  draft.segments.some((segment) => segment.text.trim() || segment.poll?.options.some((option) => option.trim()));

const pick = <T extends object, K extends keyof T>(value: T, parsers: Record<K, unknown>) =>
  Object.fromEntries(Object.keys(parsers).map((key) => [key, value[key as K]])) as Pick<T, K>;

// Field order is fixed so two drafts with the same content serialise to the same string.
const portable = (draft: SavedDraft): BackupDraft => ({
  ...pick(draft, DRAFT_PARSERS),
  segments: draft.segments.map((segment) => ({
    ...pick(segment, SEGMENT_PARSERS),
    poll: segment.poll && pick(segment.poll, POLL_PARSERS),
  })),
});

const toSaved = (draft: BackupDraft): SavedDraft => ({
  ...draft,
  segments: draft.segments.map((segment) => ({ ...segment, media: [] })),
});

export function buildBackup(snapshot: Snapshot): string {
  const drafts = Object.fromEntries(
    Object.entries(snapshot.drafts).map(([owner, list]) => [owner, list.filter(hasText).map(portable)]),
  );
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      data: {
        prefs: snapshot.prefs,
        theme: snapshot.theme,
        homeSource: snapshot.homeSource,
        drafts,
        recentSearches: snapshot.recentSearches,
      },
    },
    null,
    2,
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A parser returns the checked value, or null when the input is not acceptable.
type Parse<T> = (value: unknown) => T | null;
type Parsers<T> = { [K in keyof T]-?: Parse<T[K]> };

const text =
  (max: number, min = 0): Parse<string> =>
  (value) =>
    typeof value === 'string' && value.length >= min && value.length <= max ? value : null;

const bool: Parse<boolean> = (value) => (typeof value === 'boolean' ? value : null);

const finite: Parse<number> = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const oneOf =
  <T>(options: readonly T[]): Parse<T> =>
  (value) =>
    options.find((option) => option === value) ?? null;

const optional =
  <T>(parse: Parse<T>): Parse<T | undefined> =>
  (value) =>
    value === undefined ? undefined : parse(value);

const array =
  <T>(parse: Parse<T>, min = 0, max = Infinity): Parse<T[]> =>
  (value) => {
    if (!Array.isArray(value) || value.length < min || value.length > max) return null;
    const items: T[] = [];
    for (const item of value) {
      const parsed = parse(item);
      if (parsed === null) return null;
      items.push(parsed);
    }
    return items;
  };

const shape =
  <T extends object>(parsers: Parsers<T>): Parse<T> =>
  (value) => {
    if (!isObject(value)) return null;
    const parsed: Record<string, unknown> = {};
    for (const [key, parse] of Object.entries<Parse<unknown>>(parsers)) {
      const field = parse(value[key]);
      if (field === null) return null;
      parsed[key] = field;
    }
    return parsed as T;
  };

const byOwner =
  <T>(parse: Parse<T>): Parse<Record<string, T>> =>
  (value) => {
    if (!isObject(value)) return null;
    const parsed: Record<string, T> = {};
    for (const [owner, item] of Object.entries(value)) {
      const field = parse(item);
      if (!OWNER.test(owner) || field === null) return null;
      parsed[owner] = field;
    }
    return parsed;
  };

const themeCss =
  (type: 'theme' | 'tweak'): Parse<string> =>
  (css) => {
    if (typeof css !== 'string') return null;
    const file = parseThemeFile(css);
    return typeof file !== 'string' && file.type === type ? css : null;
  };

function readPrefs(value: unknown): Prefs | null {
  if (!isObject(value)) return null;
  const prefs: Record<string, unknown> = { ...PREF_DEFAULTS };
  for (const key of Object.keys(PREF_DEFAULTS) as (keyof Prefs)[]) {
    const next = value[key];
    if (next === undefined) continue;
    const options: readonly unknown[] = key in PREF_OPTIONS ? PREF_OPTIONS[key as keyof typeof PREF_OPTIONS] : [true, false];
    if (!options.includes(next)) return null;
    prefs[key] = next;
  }
  return prefs as Prefs;
}

const readThemes = array(
  shape<CustomTheme>({
    id: text(100, 1),
    name: text(200, 1),
    kind: oneOf(KINDS),
    css: themeCss('theme'),
    source: optional(text(2048)),
  }),
);

const readTweaks = array(
  shape<CustomTweak>({
    id: text(100, 1),
    name: text(200, 1),
    css: themeCss('tweak'),
    enabled: bool,
    source: optional(text(2048)),
  }),
);

function readTheme(value: unknown): ThemeState | null {
  if (!isObject(value) || !isObject(value.selected)) return null;
  const appearance = oneOf(APPEARANCES)(value.appearance);
  const themes = readThemes(value.themes);
  const tweaks = readTweaks(value.tweaks);
  if (!appearance || !themes || !tweaks) return null;
  const selected = {} as Record<ThemeKind, string | null>;
  for (const kind of KINDS) {
    const id = value.selected[kind];
    if (id === null) selected[kind] = null;
    else if (typeof id === 'string' && themes.some((theme) => theme.id === id && theme.kind === kind)) selected[kind] = id;
    else return null;
  }
  return { appearance, themes, tweaks, selected };
}

const POLL_PARSERS: Parsers<PollDraft> = {
  options: array(text(500), 0, 10),
  multiple: bool,
  hideTotals: bool,
  expiresIn: finite,
};

const SEGMENT_PARSERS: Parsers<BackupSegment> = {
  text: text(10000),
  poll: optional(shape(POLL_PARSERS)),
};

// The one list of what a backup keeps of a draft: it drives both the export and the import.
const DRAFT_PARSERS: Parsers<BackupDraft> = {
  id: text(100, 1),
  updatedAt: finite,
  segments: array(shape(SEGMENT_PARSERS), 1, DRAFT_LIMIT),
  warning: text(2000),
  showWarning: bool,
  visibility: optional(oneOf(VISIBILITIES)),
  language: optional(text(20)),
  replyTo: optional(text(200, 1)),
  quote: optional(text(200, 1)),
  selfLabel: optional(oneOf(SELF_LABELS)),
  interactions: optional(shape<PostInteractions>({ replies: oneOf(REPLY_AUDIENCES), quotes: bool })),
};

const readDrafts = byOwner(array(shape(DRAFT_PARSERS)));

const readRecent = byOwner(array(text(200, 1), 0, RECENT_LIMIT));

// An item with the same content as one present is kept once, whatever its id; a clashing id gets a fresh one.
function mergeItems<T extends { id: string }>(
  current: T[],
  incoming: T[],
  newId: () => string,
  content: (item: T) => string,
) {
  const list = [...current];
  const ids = new Map<string, string>();
  for (const item of incoming) {
    const same = list.find((existing) => content(existing) === content(item));
    if (same) {
      ids.set(item.id, same.id);
      continue;
    }
    const id = list.some((existing) => existing.id === item.id) ? newId() : item.id;
    ids.set(item.id, id);
    list.push({ ...item, id });
  }
  return { list, ids };
}

function mergeTheme(current: ThemeState, incoming: ThemeState, newId: () => string): ThemeState {
  const themes = mergeItems(current.themes, incoming.themes, newId, (theme) =>
    JSON.stringify([theme.name, theme.kind, theme.css, theme.source]),
  );
  const tweaks = mergeItems(current.tweaks, incoming.tweaks, newId, (tweak) =>
    JSON.stringify([tweak.name, tweak.css, tweak.enabled, tweak.source]),
  );
  const mapped = (id: string | null) => (id === null ? null : (themes.ids.get(id) ?? null));
  return {
    appearance: incoming.appearance,
    themes: themes.list,
    tweaks: tweaks.list,
    selected: { light: mapped(incoming.selected.light), dark: mapped(incoming.selected.dark) },
  };
}

function mergeDrafts(current: SavedDraft[], incoming: BackupDraft[], newId: () => string) {
  const merged = [...current];
  for (const item of incoming) {
    const json = JSON.stringify(item);
    if (merged.some((existing) => JSON.stringify(portable(existing)) === json)) continue;
    const draft = toSaved(item);
    merged.push(merged.some((existing) => existing.id === draft.id) ? { ...draft, id: newId() } : draft);
  }
  return merged;
}

function mergeRecent(current: string[], incoming: string[]) {
  return [...current, ...incoming.filter((query) => !current.includes(query))].slice(0, RECENT_LIMIT);
}

function mergeByOwner<A, B>(current: Record<string, A[]>, incoming: Record<string, B[]>, merge: (a: A[], b: B[]) => A[]) {
  const owners = new Set([...Object.keys(current), ...Object.keys(incoming)]);
  return Object.fromEntries([...owners].map((owner) => [owner, merge(current[owner] ?? [], incoming[owner] ?? [])]));
}

function merge(current: Snapshot, incoming: Incoming, newId: () => string): Snapshot {
  return {
    prefs: incoming.prefs,
    theme: mergeTheme(current.theme, incoming.theme, newId),
    homeSource: incoming.homeSource ?? current.homeSource,
    drafts: mergeByOwner(current.drafts, incoming.drafts, (a, b) => mergeDrafts(a, b, newId)),
    recentSearches: mergeByOwner(current.recentSearches, incoming.recentSearches, mergeRecent),
  };
}

// Validates the whole file before anything is merged, so a refused file changes nothing.
export function planRestore(text: string, current: Snapshot, newId: () => string): Restore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'format' };
  }
  if (!isObject(parsed) || parsed.format !== BACKUP_FORMAT) return { error: 'format' };
  const version = parsed.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { error: 'format' };
  if (version > BACKUP_VERSION) return { error: 'newer' };
  const data = parsed.data;
  if (!isObject(data)) return { error: 'invalid' };
  const prefs = readPrefs(data.prefs);
  const theme = readTheme(data.theme);
  const drafts = readDrafts(data.drafts);
  const recentSearches = readRecent(data.recentSearches);
  const homeSource = data.homeSource ?? null;
  if (!prefs || !theme || !drafts || !recentSearches) return { error: 'invalid' };
  if (homeSource !== null && !isHomeSource(homeSource)) return { error: 'invalid' };
  return { snapshot: merge(current, { prefs, theme, homeSource, drafts, recentSearches }, newId) };
}
