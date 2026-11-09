import { resolveLanguage, resolveVisibility } from '@/api/ap/compose';
import { toPostingDefaults } from '@/model/adapters/ap';

jest.mock('masto', () => ({ createRestAPIClient: jest.fn() }));

const defaults = (visibility?: 'public' | 'unlisted' | 'private' | 'direct', language?: string) => ({ visibility, language, sensitive: false });

describe('resolveVisibility', () => {
  it('keeps the visibility of an edited post', () => {
    expect(resolveVisibility({ editing: 'public', defaults: defaults('private') })).toBe('public');
  });

  it('never widens a reply beyond the parent or the account default', () => {
    expect(resolveVisibility({ parent: 'unlisted', defaults: defaults('private') })).toBe('private');
    expect(resolveVisibility({ parent: 'public', defaults: defaults('unlisted') })).toBe('unlisted');
    expect(resolveVisibility({ parent: 'private', defaults: defaults('public') })).toBe('private');
    expect(resolveVisibility({ parent: 'direct', defaults: defaults('unlisted') })).toBe('direct');
    expect(resolveVisibility({ parent: 'unlisted' })).toBe('unlisted');
  });

  it('prefers prefill, then the saved draft, then the account default, then public', () => {
    expect(resolveVisibility({ prefill: 'direct', saved: 'private', defaults: defaults('unlisted') })).toBe('direct');
    expect(resolveVisibility({ saved: 'private', defaults: defaults('unlisted') })).toBe('private');
    expect(resolveVisibility({ defaults: defaults('unlisted') })).toBe('unlisted');
    expect(resolveVisibility({ defaults: defaults() })).toBe('public');
    expect(resolveVisibility({})).toBe('public');
  });
});

describe('resolveLanguage', () => {
  it('prefers the saved draft, then the account language, then the device', () => {
    expect(resolveLanguage('fr', defaults('public', 'de'))).toBe('fr');
    expect(resolveLanguage(undefined, defaults('public', 'de'))).toBe('de');
    expect(resolveLanguage(undefined, defaults())).toMatch(/^[a-z]{2,3}$/);
    expect(resolveLanguage()).toMatch(/^[a-z]{2,3}$/);
  });
});

describe('toPostingDefaults', () => {
  it('normalises the credential source', () => {
    const account = (source: object) => ({ source }) as Parameters<typeof toPostingDefaults>[0];
    expect(toPostingDefaults(account({ privacy: 'unlisted', language: 'en', sensitive: true }))).toEqual({ visibility: 'unlisted', language: 'en', sensitive: true });
    expect(toPostingDefaults(account({ privacy: null, language: '', sensitive: null }))).toEqual({ visibility: undefined, language: undefined, sensitive: false });
  });
});
