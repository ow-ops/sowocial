import { BACKUP_VERSION, buildBackup, planRestore, type Snapshot } from '@/backup/backup';
import { PREF_DEFAULTS } from '@/prefs/store';
import type { SavedDraft } from '@/utils/drafts';

jest.mock('@/utils/kv', () => ({ readItem: () => null, writeItem: () => {}, removeItem: () => {} }));

const css = (name: string) => `/*\n@sowocial-theme\nname: ${name}\n*/\n:root { --sowocial-page: #0c0a14; }\n`;
const tweakCss = '/*\n@sowocial-tweak\nname: Calm\n*/\n:root { --sowocial-primary: #c8b8ec; }\n';
const OWNER = 'account.example.social.42';

const empty = (): Snapshot => ({
  prefs: PREF_DEFAULTS,
  theme: { appearance: 'system', themes: [], tweaks: [], selected: { light: null, dark: null }, byAccount: {} },
  homeSource: null,
  drafts: {},
  recentSearches: {},
});

const draft = (id: string, text: string, extra: Partial<SavedDraft> = {}): SavedDraft => ({
  id,
  updatedAt: 1,
  segments: [{ text, media: [] }],
  warning: '',
  showWarning: false,
  ...extra,
});

const counter = () => {
  let next = 0;
  return () => `new-${++next}`;
};

const restore = (text: string, current: Snapshot = empty(), newId = counter()) => planRestore(text, current, newId);

function snapshotWith(): Snapshot {
  return {
    prefs: { ...PREF_DEFAULTS, density: 'compact', haptics: false, links: 'system' },
    theme: {
      appearance: 'dark',
      themes: [{ id: 't1', name: 'Dusk', kind: 'dark', css: css('Dusk'), source: 'https://example.org/dusk.sowocial.css' }],
      tweaks: [{ id: 'w1', name: 'Calm', css: tweakCss, enabled: true }],
      selected: { light: null, dark: 't1' },
      byAccount: { [OWNER]: { light: null, dark: 't1' } },
    },
    homeSource: 'mixed',
    drafts: {
      [OWNER]: [
        draft('auto', 'Hello fediverse', { visibility: 'private', language: 'fr', showWarning: true, warning: 'cw' }),
        draft('d2', 'A poll', {
          segments: [{ text: 'Pick one', media: [], poll: { options: ['yes', 'no'], multiple: false, hideTotals: true, expiresIn: 3600 } }],
        }),
      ],
    },
    recentSearches: { [OWNER]: ['rust', 'expo'] },
  };
}

describe('buildBackup', () => {
  it('writes a format name and version at the top', () => {
    const parsed = JSON.parse(buildBackup(empty()));
    expect(Object.keys(parsed)).toEqual(['format', 'version', 'data']);
    expect(parsed.format).toBe('sowocial-backup');
    expect(parsed.version).toBe(BACKUP_VERSION);
  });

  it('leaves drafts media, video and thread position out of the file', () => {
    const snapshot = empty();
    snapshot.drafts[OWNER] = [
      {
        ...draft('d1', 'Look at this'),
        segments: [{ text: 'Look at this', media: [{ uri: 'file:///secret-photo.jpg', description: '' }], video: {
          uri: 'file:///secret-clip.mp4', description: '', width: 1, height: 1, size: 1, durationMs: 1, mimeType: 'video/mp4',
        } }],
        chain: { inReplyToId: 'secret-thread-parent' },
      },
    ];
    const text = buildBackup(snapshot);
    expect(text).toContain('Look at this');
    expect(text).not.toMatch(/secret-photo|secret-clip|secret-thread-parent|inReplyToId|"media"|"video"/);
  });

  it('drops drafts that have no text left', () => {
    const snapshot = empty();
    snapshot.drafts[OWNER] = [draft('blank', '   ')];
    expect(JSON.parse(buildBackup(snapshot)).data.drafts).toEqual({ [OWNER]: [] });
  });

  it('contains no credentials or device state', () => {
    const text = buildBackup(snapshotWith());
    expect(text).not.toMatch(/token|dpop|push|session|secret|password|subscri/i);
  });
});

describe('planRestore round trip', () => {
  it('restores what was backed up onto an empty device', () => {
    const original = snapshotWith();
    const result = restore(buildBackup(original));
    if (!('snapshot' in result)) throw new Error(result.error);
    expect(result.snapshot.prefs).toEqual(original.prefs);
    expect(result.snapshot.theme).toEqual(original.theme);
    expect(result.snapshot.homeSource).toBe('mixed');
    expect(result.snapshot.recentSearches).toEqual(original.recentSearches);
    expect(result.snapshot.drafts[OWNER]).toEqual(
      original.drafts[OWNER].map((d) => ({ ...d, segments: d.segments.map((s) => ({ ...s, media: [] })) })),
    );
  });

  it('ignores keys it does not know', () => {
    const data = JSON.parse(buildBackup(empty()));
    data.data.prefs.futureSetting = true;
    data.data.extra = { anything: 1 };
    const result = restore(JSON.stringify(data));
    if (!('snapshot' in result)) throw new Error(result.error);
    expect(result.snapshot.prefs).toEqual(PREF_DEFAULTS);
    expect(result.snapshot.prefs).not.toHaveProperty('futureSetting');
  });
});

describe('planRestore refuses files', () => {
  const withData = (patch: (data: Record<string, unknown>) => void) => {
    const parsed = JSON.parse(buildBackup(snapshotWith()));
    patch(parsed.data);
    return JSON.stringify(parsed);
  };

  it('refuses text that is not JSON or not a backup', () => {
    expect(restore('not json')).toEqual({ error: 'format' });
    expect(restore(JSON.stringify({ format: 'something-else', version: 1, data: {} }))).toEqual({ error: 'format' });
    expect(restore(JSON.stringify({ format: 'sowocial-backup', version: 0, data: {} }))).toEqual({ error: 'format' });
  });

  it('refuses a newer version with its own error', () => {
    const newer = JSON.stringify({ format: 'sowocial-backup', version: BACKUP_VERSION + 1, data: 'whatever' });
    expect(restore(newer)).toEqual({ error: 'newer' });
  });

  it('refuses an unknown preference value without returning any state', () => {
    const result = restore(withData((data) => ((data.prefs as Record<string, unknown>).density = 'huge')));
    expect(result).toEqual({ error: 'invalid' });
    expect(result).not.toHaveProperty('snapshot');
  });

  it('refuses a theme file that is not a theme', () => {
    const result = restore(withData((data) => ((data.theme as { themes: unknown[] }).themes = [{ id: 'x', name: 'x', kind: 'dark', css: 'plain text' }])));
    expect(result).toEqual({ error: 'invalid' });
  });

  it('refuses a selection that points at a missing theme', () => {
    const result = restore(withData((data) => ((data.theme as { selected: unknown }).selected = { light: 'nope', dark: null })));
    expect(result).toEqual({ error: 'invalid' });
  });

  it('refuses drafts with values the composer does not accept', () => {
    const result = restore(withData((data) => ((data.drafts as Record<string, { visibility: string }[]>)[OWNER][0].visibility = 'everyone')));
    expect(result).toEqual({ error: 'invalid' });
  });

  it('refuses a file where one section is broken, even if the rest is fine', () => {
    const result = restore(withData((data) => (data.recentSearches = { [OWNER]: 'rust' })));
    expect(result).toEqual({ error: 'invalid' });
  });
});

describe('merging into existing state', () => {
  it('replaces preferences and keeps the current home source when the file has none', () => {
    const current = { ...empty(), prefs: { ...PREF_DEFAULTS, haptics: true }, homeSource: 'ap' as const };
    const backup = buildBackup({ ...empty(), prefs: { ...PREF_DEFAULTS, haptics: false } });
    const result = restore(backup, current);
    if (!('snapshot' in result)) throw new Error(result.error);
    expect(result.snapshot.prefs.haptics).toBe(false);
    expect(result.snapshot.homeSource).toBe('ap');
  });

  it('keeps existing themes, skips identical ones and gives clashing ids a new id', () => {
    const current = empty();
    current.theme.themes = [{ id: 'a', name: 'Mine', kind: 'light', css: css('Mine') }];
    const incoming = empty();
    incoming.theme = {
      appearance: 'light',
      themes: [
        { id: 'b', name: 'Mine', kind: 'light', css: css('Mine') },
        { id: 'a', name: 'Other', kind: 'dark', css: css('Other') },
      ],
      tweaks: [],
      selected: { light: 'b', dark: 'a' },
      byAccount: {},
    };
    const result = restore(buildBackup(incoming), current);
    if (!('snapshot' in result)) throw new Error(result.error);
    expect(result.snapshot.theme.themes.map((t) => [t.id, t.name])).toEqual([
      ['a', 'Mine'],
      ['new-1', 'Other'],
    ]);
    expect(result.snapshot.theme.selected).toEqual({ light: 'a', dark: 'new-1' });
  });

  it('maps the selected theme to the id it was given on this device', () => {
    const incoming = empty();
    incoming.theme = {
      appearance: 'dark',
      themes: [{ id: 'a', name: 'Other', kind: 'dark', css: css('Other') }],
      tweaks: [{ id: 'w', name: 'Calm', css: tweakCss, enabled: false }],
      selected: { light: null, dark: 'a' },
      byAccount: { [OWNER]: { light: null, dark: 'a' } },
    };
    const current = empty();
    current.theme.themes = [{ id: 'a', name: 'Mine', kind: 'dark', css: css('Mine') }];
    const result = restore(buildBackup(incoming), current);
    if (!('snapshot' in result)) throw new Error(result.error);
    expect(result.snapshot.theme.selected.dark).toBe('new-1');
    expect(result.snapshot.theme.byAccount[OWNER]).toEqual({ light: null, dark: 'new-1' });
    expect(result.snapshot.theme.tweaks).toHaveLength(1);
  });

  it('adds drafts without deleting or duplicating existing ones', () => {
    const current = empty();
    const existing = draft('d1', 'Keep me', { updatedAt: 5 });
    current.drafts[OWNER] = [existing];
    const incoming = empty();
    incoming.drafts[OWNER] = [
      draft('d1', 'Keep me', { updatedAt: 5 }),
      draft('d1', 'Different text', { updatedAt: 9 }),
      draft('d3', 'New one'),
    ];
    const result = restore(buildBackup(incoming), current);
    if (!('snapshot' in result)) throw new Error(result.error);
    expect(result.snapshot.drafts[OWNER].map((d) => [d.id, d.segments[0].text])).toEqual([
      ['d1', 'Keep me'],
      ['new-1', 'Different text'],
      ['d3', 'New one'],
    ]);
  });

  it('keeps existing recent searches first and skips repeats', () => {
    const current = empty();
    current.recentSearches[OWNER] = ['cats'];
    const incoming = empty();
    incoming.recentSearches[OWNER] = ['dogs', 'cats'];
    const result = restore(buildBackup(incoming), current);
    if (!('snapshot' in result)) throw new Error(result.error);
    expect(result.snapshot.recentSearches[OWNER]).toEqual(['cats', 'dogs']);
  });

  it('does not change the current state it was given', () => {
    const current = snapshotWith();
    const before = JSON.stringify(current);
    restore(buildBackup(empty()), current);
    expect(JSON.stringify(current)).toBe(before);
  });
});
