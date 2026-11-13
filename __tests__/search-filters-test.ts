import type { Agent } from '@atproto/api';

import { bskySearch } from '@/api/bsky/read';
import { fediverseSearchQuery, hasPostFilters } from '@/api/ap/search-query';
import { bskyPostSearch } from '@/api/bsky/search-query';
import { activeFilterCount, cleanFilters, initialDate, isDateRangeValid, normalizeHandle, toDateString } from '@/utils/search-filters';

describe('fediverseSearchQuery', () => {
  it('keeps the query as is without filters', () => {
    expect(fediverseSearchQuery('cats')).toBe('cats');
  });

  it('appends the filters as Mastodon operators', () => {
    expect(fediverseSearchQuery('cats', { from: '@alice', since: '2026-01-01', until: '2026-02-01', lang: 'fr' })).toBe(
      'cats from:alice after:2026-01-01 before:2026-02-01 language:fr',
    );
  });
});

describe('bskyPostSearch', () => {
  it('maps the filters to searchPosts parameters', () => {
    expect(bskyPostSearch('cats', { sort: 'latest', from: '@alice.test', since: '2026-01-01', lang: 'fr' })).toEqual({
      q: 'cats',
      sort: 'latest',
      author: 'alice.test',
      since: '2026-01-01',
      until: undefined,
      lang: 'fr',
    });
  });
});

describe('hasPostFilters', () => {
  it('ignores the sort, which is not a post restriction', () => {
    expect(hasPostFilters({ sort: 'latest' })).toBe(false);
    expect(hasPostFilters(undefined)).toBe(false);
    expect(hasPostFilters({ lang: 'fr' })).toBe(true);
  });
});

describe('bskySearch with filters', () => {
  it('applies the filters to posts only', async () => {
    const searchPosts = jest.fn(async () => ({ data: { posts: [] } }));
    const searchActors = jest.fn(async () => ({ data: { actors: [] } }));
    const agent = { app: { bsky: { feed: { searchPosts } } }, searchActors } as unknown as Agent;

    await bskySearch(agent, 'cats', { sort: 'latest', from: 'alice.test', until: '2026-02-01' });

    expect(searchPosts).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'cats', sort: 'latest', author: 'alice.test', until: '2026-02-01', limit: 20 }),
    );
    expect(searchActors).toHaveBeenCalledWith({ q: 'cats', limit: 20 });
  });
});

describe('search filter helpers', () => {
  it('normalizes pasted handles', () => {
    expect(normalizeHandle('  @alice@mastodon.social ')).toBe('alice@mastodon.social');
    expect(normalizeHandle('@ alice.test')).toBe('alice.test');
  });

  it('accepts an open or ordered date range only', () => {
    expect(isDateRangeValid(undefined, '2026-01-01')).toBe(true);
    expect(isDateRangeValid('2026-01-01', '2026-01-01')).toBe(true);
    expect(isDateRangeValid('2026-02-01', '2026-01-01')).toBe(false);
  });

  it('starts a new date inside the allowed range', () => {
    const today = new Date(2026, 5, 15);
    expect(toDateString(initialDate(undefined, undefined, today))).toBe('2026-06-15');
    expect(toDateString(initialDate('2026-07-01', undefined, today))).toBe('2026-07-01');
    expect(toDateString(initialDate(undefined, '2026-05-01', today))).toBe('2026-05-01');
  });

  it('cleans the draft before applying it', () => {
    expect(cleanFilters({ sort: 'top', from: ' @alice ', since: undefined, lang: '' })).toEqual({ sort: 'top', from: 'alice' });
  });

  it('counts only active restrictions and a non-default sort', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ sort: 'top', from: '  ' })).toBe(0);
    expect(activeFilterCount({ sort: 'latest', from: 'a', since: '2026-01-01', lang: 'fr' })).toBe(4);
  });
});
