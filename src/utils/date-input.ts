// Date-only strings parse as UTC midnight, which is the previous day west of UTC; datetime-local strings already parse as local.
export function parseDateInput(value: string) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return date ? new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3])) : new Date(value);
}
