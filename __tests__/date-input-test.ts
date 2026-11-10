import { parseDateInput } from '@/utils/date-input';

describe('parseDateInput', () => {
  it('reads a date-only value as local midnight', () => {
    const date = parseDateInput('2000-03-15');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2000, 2, 15, 0]);
  });

  it('reads a datetime-local value as local time', () => {
    const date = parseDateInput('2000-03-15T13:45');
    expect([date.getDate(), date.getHours(), date.getMinutes()]).toEqual([15, 13, 45]);
  });

  it('returns an invalid date for garbage', () => {
    expect(Number.isNaN(parseDateInput('').getTime())).toBe(true);
  });
});
