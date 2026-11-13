import type { SearchFilters } from '../backend/types';

export const bskyPostSearch = (q: string, filters: SearchFilters = {}) => ({
  q,
  sort: filters.sort,
  author: filters.from?.replace(/^@/, ''),
  since: filters.since,
  until: filters.until,
  lang: filters.lang,
});
