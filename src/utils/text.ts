import { intlLocale, t } from '@/i18n';

const URL_PATTERN = /https?:\/\/\S+/g;

// Servers count every link as a fixed number of characters.
export function countCharacters(text: string, perUrl: number) {
  return Array.from(text.replace(URL_PATTERN, 'x'.repeat(perUrl))).length;
}

// 1234 reads as 1.2K, rounded down. Hermes has no dependable compact notation, so only the decimal mark comes from Intl.
export function shortCount(count: number) {
  if (count < 1000) return String(count);
  const [unit, key] = count < 1e6 ? ([1e3, 'common.thousands'] as const) : ([1e6, 'common.millions'] as const);
  const value = count < unit * 10 ? Math.floor(count / (unit / 10)) / 10 : Math.floor(count / unit);
  return t(key, { value: new Intl.NumberFormat(intlLocale()).format(value) });
}
