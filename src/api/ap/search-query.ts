import type { SearchFilters } from '../backend/types';

export const hasPostFilters = (filters?: SearchFilters) => Boolean(filters?.from || filters?.since || filters?.until || filters?.lang);

// Mastodon has no filter parameters for search, so the filters become operators in the query.
export function fediverseSearchQuery(q: string, filters: SearchFilters = {}) {
  const operators = [
    filters.from && `from:${filters.from.replace(/^@/, '')}`,
    filters.since && `after:${filters.since}`,
    filters.until && `before:${filters.until}`,
    filters.lang && `language:${filters.lang}`,
  ];
  return [q, ...operators.filter(Boolean)].join(' ');
}
