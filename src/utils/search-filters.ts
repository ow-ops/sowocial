import type { SearchFilters } from '@/api/backend/types';
import { parseDateInput } from '@/utils/date-input';

// Pasted handles come with an @ and stray spaces; the query builders expect neither.
export const normalizeHandle = (value: string) => value.trim().replace(/^@/, '').trim();

export const toDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Both are YYYY-MM-DD, so string order is date order.
export const isDateRangeValid = (since?: string, until?: string) => !since || !until || since <= until;

// Today, moved inside the allowed range so a freshly set date never starts out invalid.
export function initialDate(min?: string, max?: string, today = new Date()) {
  const day = toDateString(today);
  if (min && day < min) return parseDateInput(min);
  if (max && day > max) return parseDateInput(max);
  return parseDateInput(day);
}

export function cleanFilters(filters: SearchFilters): SearchFilters {
  const from = filters.from && normalizeHandle(filters.from);
  return Object.fromEntries(Object.entries({ ...filters, from }).filter(([, value]) => value)) as SearchFilters;
}

// The sort is a view choice, not a restriction, so only a non-default one counts.
export const activeFilterCount = ({ sort, ...restrictions }: SearchFilters) =>
  Object.keys(cleanFilters(restrictions)).length + (sort === 'latest' ? 1 : 0);
