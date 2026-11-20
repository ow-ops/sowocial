import type { PostDraft } from '@/api/backend/draft';
import { ATTEMPT_TIMEOUT_MS, createProcessor, drain, isRetryable, loadItems, migrateDraft, type OutboxDeps } from '@/api/outbox';
import { tid } from '@/api/bsky/tid';

const draft = (status: string, extra: Partial<PostDraft> = {}): PostDraft => ({ status, visibility: 'public', media: [], ...extra });

// What masto throws for an HTTP error answer: MastoHttpError carries `statusCode`.
const httpError = (statusCode: number) => Object.assign(new Error('nope'), { statusCode });

const authFailed = (_protocol: string, error: unknown) => (error as { status?: number })?.status === 401;

function setup(post: (key: string, d: PostDraft) => Promise<unknown> = async () => ({}), accounts = ['ap', 'bsky']) {
  let raw: string | null = null;
  const calls: { account: string; draft: PostDraft }[] = [];
  const saved: { account: string; id: string; text: string }[] = [];
  const removed: string[] = [];
  const gaveUp: string[] = [];
  let clock = 0;
  let n = 0;
  const deps: OutboxDeps = {
    store: { read: () => raw, write: (v) => void (raw = v) },
    files: { copy: (uri) => `kept:${uri}`, remove: (uri) => void removed.push(uri) },
    backendFor: (account) => ({
      protocol: account === 'bsky' ? 'bsky' : 'ap',
      post: async (d) => {
        calls.push({ account, draft: d });
        return post(account, d) as never;
      },
    }),
    authFailed,
    hasAccount: (account) => accounts.includes(account),
    saveDraft: (account, d) => void saved.push({ account, id: d.id, text: d.segments[0].text }),
    gaveUp: (item) => void gaveUp.push(item.account),
    newId: () => `id${++n}`,
    now: () => ++clock,
  };
  return { deps, calls, saved, removed, gaveUp, items: () => loadItems(deps.store) };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r));
};

describe('outbox', () => {
  it('persists an item with its own copies of the media and survives a restart', async () => {
    const t = setup();
    const processor = createProcessor(t.deps);
    processor.enqueue([{ account: 'ap', draft: draft('hi', { media: [{ uri: 'file:///a.jpg', description: 'cat' }] }) }]);
    expect(t.items()).toEqual([
      { id: 'id1', account: 'ap', attempts: 0, createdAt: 1, draft: expect.objectContaining({ status: 'hi', media: [{ uri: 'kept:file:///a.jpg', description: 'cat' }] }) },
    ]);
    await drain({ ...t.deps }); // a new processor over the same storage
    expect(t.calls.map((c) => c.draft.status)).toEqual(['hi']);
    expect(t.items()).toEqual([]);
    expect(t.removed).toEqual(['kept:file:///a.jpg']);
  });

  it('keeps a transiently failed item, counting the attempt', async () => {
    const t = setup(async () => {
      throw httpError(503);
    });
    createProcessor(t.deps).enqueue([{ account: 'ap', draft: draft('hi') }]);
    await drain(t.deps);
    expect(t.items()[0].attempts).toBe(1);
    await drain(t.deps);
    expect(t.items()[0].attempts).toBe(2);
    expect(t.saved).toEqual([]);
  });

  it('turns the item into a draft after the third failure, keeping its files', async () => {
    const t = setup(async () => {
      throw new TypeError('Network request failed');
    });
    createProcessor(t.deps).enqueue([{ account: 'bsky', draft: draft('hi', { media: [{ uri: 'u', description: '' }] }) }]);
    for (let i = 0; i < 3; i++) await drain(t.deps);
    expect(t.calls).toHaveLength(3);
    expect(t.items()).toEqual([]);
    expect(t.saved).toEqual([{ account: 'bsky', id: 'outbox:id1', text: 'hi' }]);
    expect(t.gaveUp).toEqual(['bsky']);
    expect(t.removed).toEqual([]);
  });

  it('gives up at once on an error a retry cannot fix', async () => {
    const t = setup(async () => {
      throw httpError(422);
    });
    createProcessor(t.deps).enqueue([{ account: 'ap', draft: draft('too long') }]);
    await drain(t.deps);
    expect(t.calls).toHaveLength(1);
    expect(t.items()).toEqual([]);
    expect(t.saved).toHaveLength(1);
  });

  it('tries each item once per run', async () => {
    const t = setup(async () => {
      throw httpError(500);
    });
    createProcessor(t.deps).enqueue([{ account: 'ap', draft: draft('a') }]);
    await drain(t.deps);
    expect(t.calls).toHaveLength(1);
  });

  it('sends the same idempotency key on every attempt, and none is added to the stored draft', async () => {
    const t = setup(async () => {
      throw httpError(500);
    });
    createProcessor(t.deps).enqueue([{ account: 'ap', draft: draft('a') }]);
    await drain(t.deps);
    await drain(t.deps);
    expect(t.calls.map((c) => c.draft.idempotencyKey)).toEqual(['id1', 'id1']);
    expect(t.items()[0].draft.idempotencyKey).toBeUndefined();
  });

  it('drops items of a signed-out account without a draft', async () => {
    const t = setup(undefined, ['ap']);
    const processor = createProcessor(t.deps);
    processor.enqueue([{ account: 'bsky', draft: draft('a', { media: [{ uri: 'u', description: '' }] }) }, { account: 'ap', draft: draft('b') }]);
    await drain(t.deps);
    expect(t.calls.map((c) => c.account)).toEqual(['ap']);
    expect(t.saved).toEqual([]);
    expect(t.removed).toEqual(['kept:u']);
    processor.enqueue([{ account: 'ap', draft: draft('c') }]);
    processor.dropAccount('ap');
    expect(t.items()).toEqual([]);
  });

  it('aborts an attempt that hangs so the next item still goes out', async () => {
    jest.useFakeTimers();
    try {
      const t = setup();
      const hung = t.deps.backendFor;
      t.deps.backendFor = (account) => ({
        ...hung(account),
        post: (d, signal) =>
          d.status === 'stuck' ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) : hung(account).post(d, signal),
      });
      createProcessor(t.deps).enqueue([{ account: 'ap', draft: draft('stuck') }, { account: 'ap', draft: draft('next') }]);
      const run = drain(t.deps);
      await jest.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS);
      await run;
      expect(t.calls.map((c) => c.draft.status)).toEqual(['next']);
      expect(t.items().map((i) => [i.draft.status, i.attempts])).toEqual([['stuck', 1]]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends oldest first', async () => {
    const t = setup();
    const processor = createProcessor(t.deps);
    processor.enqueue([{ account: 'ap', draft: draft('first') }]);
    processor.enqueue([{ account: 'bsky', draft: draft('second') }, { account: 'ap', draft: draft('third') }]);
    await drain(t.deps);
    expect(t.calls.map((c) => c.draft.status)).toEqual(['first', 'second', 'third']);
  });

  it('does not send an item twice when runs overlap', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = () => r()));
    const t = setup(() => gate);
    const processor = createProcessor(t.deps);
    processor.enqueue([{ account: 'ap', draft: draft('a') }]);
    processor.kick();
    processor.kick();
    await flush();
    release();
    await flush();
    expect(t.calls).toHaveLength(1);
    expect(t.items()).toEqual([]);
  });
});

describe('queued items from before drafts grouped network fields', () => {
  const stored = { status: 'hi', visibility: 'public', media: [] };

  it('moves Bluesky fields into the bsky part', () => {
    const video = { uri: 'v' };
    expect(migrateDraft({ ...stored, label: 'nudity', video })).toEqual({ ...stored, bsky: { label: 'nudity', video } });
  });

  it('moves fediverse fields into the ap part', () => {
    expect(migrateDraft({ ...stored, gts: { localOnly: true }, keepMediaIds: ['1'] })).toEqual({
      ...stored,
      ap: { gts: { localOnly: true }, keepMediaIds: ['1'] },
    });
  });

  it('is applied when items are loaded, and leaves current items alone', () => {
    const items = [
      { id: 'a', account: 'x', attempts: 0, createdAt: 1, draft: { ...stored, gts: { localOnly: true } } },
      { id: 'b', account: 'y', attempts: 0, createdAt: 2, draft: { ...stored, bsky: { label: 'porn' } } },
    ];
    const loaded = loadItems({ read: () => JSON.stringify(items), write: () => {} });
    expect(loaded.map((i) => i.draft)).toEqual([{ ...stored, ap: { gts: { localOnly: true } } }, { ...stored, bsky: { label: 'porn' } }]);
  });
});

describe('isRetryable', () => {
  it('retries network errors, 5xx and rate limits', () => {
    expect(isRetryable('ap', new TypeError('Network request failed'), authFailed)).toBe(true);
    expect(isRetryable('ap', httpError(502), authFailed)).toBe(true);
    expect(isRetryable('ap', httpError(429), authFailed)).toBe(true);
    expect(isRetryable('bsky', { status: 500, error: 'InternalServerError' }, authFailed)).toBe(true);
    expect(isRetryable('bsky', { status: 1 }, authFailed)).toBe(true);
  });

  it('does not retry validation errors or lost authorization', () => {
    expect(isRetryable('ap', httpError(422), authFailed)).toBe(false);
    expect(isRetryable('ap', httpError(401), authFailed)).toBe(false);
    expect(isRetryable('bsky', { status: 400, error: 'InvalidRequest' }, authFailed)).toBe(false);
    expect(isRetryable('bsky', { status: 401, error: 'ExpiredToken' }, authFailed)).toBe(false);
  });
});

describe('tid', () => {
  it('makes valid, increasing record keys', () => {
    const a = tid();
    const b = tid();
    expect(a).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/);
    expect(b > a).toBe(true);
  });
});
