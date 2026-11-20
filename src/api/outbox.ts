import type { SavedDraft } from '@/utils/drafts';

import type { PostDraft } from './backend/draft';
import type { Backend } from './backend/types';
import { singleFlight } from './single-flight';

const MAX_ATTEMPTS = 3;

// Video uploads are slow, but one hung request must not hold up every post behind it.
export const ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000;

// `id` is also what makes a retry safe: the Idempotency-Key on the fediverse, the record key (a TID) on Bluesky.
export type OutboxItem = { id: string; account: string; draft: PostDraft; attempts: number; createdAt: number };

export type OutboxStore = { read: () => string | null; write: (value: string) => void };

export type OutboxStorage = {
  store: OutboxStore;
  // Gives a file a copy that belongs to the outbox, and deletes such copies.
  files: { copy: (uri: string) => string; remove: (uri: string) => void };
};

export type OutboxDeps = OutboxStorage & {
  backendFor: (account: string) => Pick<Backend, 'protocol' | 'post'>;
  authFailed: (protocol: Backend['protocol'], error: unknown) => boolean;
  hasAccount: (account: string) => boolean;
  saveDraft: (account: string, draft: SavedDraft) => void;
  gaveUp: (item: OutboxItem, error: unknown) => void;
  newId: () => string;
  now: () => number;
};

const LEGACY_AP_FIELDS = ['gts', 'keepMediaIds', 'mediaAttributes'] as const;
const LEGACY_BSKY_FIELDS = ['parent', 'replyRef', 'label', 'interactions', 'video'] as const;

// Items queued before a draft kept each network's fields in its own part have them beside the common ones.
export function migrateDraft(stored: Record<string, unknown>): PostDraft {
  const rest = { ...stored };
  const take = (fields: readonly string[]) => {
    const part: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in rest) part[field] = rest[field];
      delete rest[field];
    }
    return part;
  };
  const ap = take(LEGACY_AP_FIELDS);
  const bsky = take(LEGACY_BSKY_FIELDS);
  if (Object.keys(bsky).length) return { ...rest, bsky } as PostDraft;
  return (Object.keys(ap).length ? { ...rest, ap } : rest) as PostDraft;
}

const LEGACY_FIELDS: readonly string[] = [...LEGACY_AP_FIELDS, ...LEGACY_BSKY_FIELDS];

const migrateItem = (item: OutboxItem): OutboxItem =>
  LEGACY_FIELDS.some((field) => field in item.draft) ? { ...item, draft: migrateDraft(item.draft) } : item;

export function loadItems({ read }: OutboxStore): OutboxItem[] {
  try {
    const items = JSON.parse(read() ?? '[]');
    return Array.isArray(items) ? items.map(migrateItem) : [];
  } catch {
    return [];
  }
}

const saveItems = ({ write }: OutboxStore, items: OutboxItem[]) => write(JSON.stringify(items));

const itemFiles = ({ draft }: OutboxItem) => [...draft.media.map((m) => m.uri), ...(draft.bsky?.video ? [draft.bsky.video.uri] : [])];

export const outboxFiles = (store: OutboxStore) => loadItems(store).flatMap(itemFiles);

const RETRYABLE_CLIENT_ERRORS = new Set([408, 425, 429]);

// MastoHttpError carries `statusCode`, the Bluesky errors `status`; masto is ESM-only, so the class is not imported here.
const statusOf = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return undefined;
  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  return [statusCode, status].find((value) => typeof value === 'number') as number | undefined;
};

// A signed-out account or a 4xx the server answered will answer the same next time; no status means the request never got an answer.
export function isRetryable(protocol: Backend['protocol'], error: unknown, authFailed: OutboxDeps['authFailed']) {
  if (authFailed(protocol, error)) return false;
  const status = statusOf(error);
  return status === undefined || status < 400 || status >= 500 || RETRYABLE_CLIENT_ERRORS.has(status);
}

// What the composer can restore. Dropped: `sensitive`, the GoToSocial options (local-only, content type, interaction policy).
const toSavedDraft = ({ id, draft }: OutboxItem): SavedDraft => ({
  id: `outbox:${id}`,
  updatedAt: 0,
  segments: [{ text: draft.status, media: draft.media, video: draft.bsky?.video }],
  warning: draft.spoilerText ?? '',
  showWarning: !!draft.spoilerText,
  visibility: draft.visibility,
  language: draft.language,
  selfLabel: draft.bsky?.label,
  interactions: draft.bsky?.interactions,
});

function withOwnFiles(draft: PostDraft, copy: OutboxStorage['files']['copy']): PostDraft {
  const owned = { ...draft, onVideoProgress: undefined, media: draft.media.map((m) => ({ ...m, uri: copy(m.uri) })) };
  const { video } = draft.bsky ?? {};
  // A draft with a video is a Bluesky one, so it has no `ap` part for the spread to carry over.
  return video ? ({ ...owned, bsky: { ...draft.bsky, video: { ...video, uri: copy(video.uri) } } } as PostDraft) : owned;
}

function enqueue(deps: OutboxStorage & Pick<OutboxDeps, 'newId' | 'now'>, posts: { account: string; draft: PostDraft }[]) {
  const createdAt = deps.now();
  const added = posts.map(({ account, draft }) => ({
    id: deps.newId(),
    account,
    attempts: 0,
    createdAt,
    draft: withOwnFiles(draft, deps.files.copy),
  }));
  saveItems(deps.store, [...loadItems(deps.store), ...added]);
}

function leave(deps: OutboxStorage, ids: Set<string>, deleteFiles: boolean) {
  const items = loadItems(deps.store);
  if (deleteFiles) items.filter((i) => ids.has(i.id)).flatMap(itemFiles).forEach(deps.files.remove);
  saveItems(deps.store, items.filter((i) => !ids.has(i.id)));
}

export function dropAccount(deps: OutboxStorage, account: string) {
  const ids = new Set(loadItems(deps.store).filter((i) => i.account === account).map((i) => i.id));
  if (ids.size) leave(deps, ids, true);
}

async function attempt(deps: OutboxDeps, item: OutboxItem) {
  const backend = deps.backendFor(item.account);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    await backend.post({ ...item.draft, idempotencyKey: item.id }, abort.signal);
    leave(deps, new Set([item.id]), true);
  } catch (error) {
    if (!loadItems(deps.store).some((i) => i.id === item.id)) return;
    const attempts = item.attempts + 1;
    if (attempts < MAX_ATTEMPTS && isRetryable(backend.protocol, error, deps.authFailed)) {
      saveItems(deps.store, loadItems(deps.store).map((i) => (i.id === item.id ? { ...i, attempts } : i)));
      return;
    }
    // The draft takes over the item's files; it is saved before the item goes so a crash in between loses nothing.
    deps.saveDraft(item.account, toSavedDraft(item));
    leave(deps, new Set([item.id]), false);
    deps.gaveUp(item, error);
  } finally {
    clearTimeout(timer);
  }
}

// Oldest first, one at a time. Each item is tried at most once per run; a failed one waits for the next run.
export async function drain(deps: OutboxDeps) {
  const tried = new Set<string>();
  for (;;) {
    const item = loadItems(deps.store)
      .sort((a, b) => a.createdAt - b.createdAt)
      .find((i) => !tried.has(i.id));
    if (!item) return;
    tried.add(item.id);
    if (!deps.hasAccount(item.account)) leave(deps, new Set([item.id]), true);
    else
      try {
        await attempt(deps, item);
      } catch (error) {
        console.warn('Outbox item failed', error);
      }
  }
}

export const createProcessor = (deps: OutboxDeps) => ({
  kick: singleFlight(() => drain(deps)),
  enqueue: (posts: { account: string; draft: PostDraft }[]) => enqueue(deps, posts),
  dropAccount: (account: string) => dropAccount(deps, account),
});
