import { differenceInSeconds, format } from 'date-fns';

import { dateLocale, t } from '@/i18n';

export function shortRelativeTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  const seconds = differenceInSeconds(now, date);
  if (seconds < 60) return t('common.time.now');
  if (seconds < 3600) return t('common.time.minutes', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('common.time.hours', { count: Math.floor(seconds / 3600) });
  if (seconds < 7 * 86400) return t('common.time.days', { count: Math.floor(seconds / 86400) });
  const pattern = date.getFullYear() === now.getFullYear() ? t('common.time.dayMonth') : t('common.time.dayMonthYear');
  return format(date, pattern, { locale: dateLocale() });
}
