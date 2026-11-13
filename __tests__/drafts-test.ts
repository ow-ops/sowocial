jest.mock('@/utils/kv', () => {
  const items = new Map<string, string>();
  return {
    readItem: (key: string) => items.get(key) ?? null,
    writeItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    keysWithPrefix: (prefix: string) => [...items.keys()].filter((key) => key.startsWith(prefix)),
  };
});
const mockRemoved: string[] = [];
const mockPruned: string[] = [];
jest.mock('@/utils/draft-files', () => ({
  KEEPS_FILES: true,
  keepFile: (uri: string) => `stored:${uri}`,
  removeFile: (uri: string) => void mockRemoved.push(uri),
  pruneFiles: (referenced: Set<string>) => void mockPruned.push(...referenced),
}));

import { deleteDraft, getDraft, loadDrafts, saveDraft, sweepDraftFiles, type SavedDraft } from '@/utils/drafts';
import { writeItem } from '@/utils/kv';

const draft = (id: string, text: string, extra: Partial<SavedDraft> = {}): SavedDraft => ({
  id,
  updatedAt: 0,
  segments: [{ text, media: [] }],
  warning: '',
  showWarning: false,
  ...extra,
});

describe('drafts', () => {
  beforeEach(() => {
    loadDrafts('a').forEach((d) => deleteDraft('a', d.id));
    mockRemoved.length = 0;
  });

  it('migrates the single text-only draft', () => {
    writeItem('compose-draft:a', JSON.stringify({ text: 'old', warning: 'cw', showWarning: true, visibility: 'unlisted', language: 'fr' }));
    const [migrated] = loadDrafts('a');
    expect(migrated).toMatchObject({ id: 'auto', warning: 'cw', showWarning: true, visibility: 'unlisted', language: 'fr' });
    expect(migrated.segments).toEqual([{ text: 'old', media: [] }]);
  });

  it('keeps several drafts, newest first', () => {
    saveDraft('a', draft('auto', 'one'));
    saveDraft('a', draft('reply:1', 'two', { replyTo: '1' }));
    expect(loadDrafts('a').map((d) => d.id)).toEqual(['reply:1', 'auto']);
    expect(getDraft('a', 'reply:1')?.replyTo).toBe('1');
  });

  it('drops a draft that holds only its prefilled text', () => {
    saveDraft('a', draft('reply:1', '@bob ', { replyTo: '1' }), '@bob ');
    expect(loadDrafts('a')).toEqual([]);
    saveDraft('a', draft('reply:1', '@bob hi', { replyTo: '1' }), '@bob ');
    expect(loadDrafts('a')).toHaveLength(1);
  });

  it('copies attachments and deletes the copies with the draft', () => {
    saveDraft('a', draft('auto', 'pic', { segments: [{ text: 'pic', media: [{ uri: 'file:///cache/x.jpg', description: 'alt' }] }] }));
    expect(loadDrafts('a')[0].segments[0].media[0]).toEqual({ uri: 'stored:file:///cache/x.jpg', description: 'alt' });
    deleteDraft('a', 'auto');
    expect(mockRemoved).toContain('stored:file:///cache/x.jpg');
    expect(loadDrafts('a')).toEqual([]);
  });

  it('removes files that an edit dropped from the draft', () => {
    const media = [{ uri: 'stored:file:///cache/x.jpg', description: '' }];
    saveDraft('a', draft('auto', 'pic', { segments: [{ text: 'pic', media }] }));
    saveDraft('a', draft('auto', 'pic'));
    expect(mockRemoved).toContain('stored:stored:file:///cache/x.jpg');
  });

  it('sweeps with the files of every account\'s drafts', () => {
    mockPruned.length = 0;
    saveDraft('a', draft('x', 'one', { segments: [{ text: 'one', media: [{ uri: 'f1', description: '' }] }] }));
    saveDraft('b', draft('y', 'two', { segments: [{ text: 'two', media: [], video: { uri: 'f2' } as never }] }));
    sweepDraftFiles();
    expect(mockPruned.sort()).toEqual(['stored:f1', 'stored:f2']);
    deleteDraft('b', 'y');
  });

  it('round-trips the Bluesky fields', () => {
    saveDraft('a', draft('bs', 'hi', { selfLabel: 'porn', interactions: { replies: 'nobody', quotes: false }, quote: 'q1' }));
    expect(getDraft('a', 'bs')).toMatchObject({ selfLabel: 'porn', interactions: { replies: 'nobody', quotes: false }, quote: 'q1' });
  });

  it('round-trips the thread chain so a resumed draft continues the thread', () => {
    const ref = { uri: 'at://a/app.bsky.feed.post/1', cid: 'c1' };
    saveDraft('a', draft('t1', 'second', { chain: { inReplyToId: '42' } }));
    saveDraft('a', draft('t2', 'second', { chain: { replyRef: { root: ref, parent: ref } } }));
    expect(getDraft('a', 't1')?.chain).toEqual({ inReplyToId: '42' });
    expect(getDraft('a', 't2')?.chain).toEqual({ replyRef: { root: ref, parent: ref } });
  });
});
