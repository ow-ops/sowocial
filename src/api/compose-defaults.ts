import type { PostingDefaults, Visibility } from '@/model/post';

export function deviceLanguage() {
  return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0];
}

const RESTRICTIVENESS: Visibility[] = ['public', 'unlisted', 'private', 'direct'];

const narrower = (a: Visibility, b: Visibility) => (RESTRICTIVENESS.indexOf(a) >= RESTRICTIVENESS.indexOf(b) ? a : b);

export function resolveVisibility({
  editing,
  parent,
  prefill,
  saved,
  defaults,
}: {
  editing?: Visibility;
  parent?: Visibility;
  prefill?: Visibility;
  saved?: Visibility;
  defaults?: PostingDefaults;
}): Visibility {
  if (editing) return editing;
  if (parent) return saved ?? (defaults?.visibility ? narrower(parent, defaults.visibility) : parent);
  return prefill ?? saved ?? defaults?.visibility ?? 'public';
}

export const resolveLanguage = (saved?: string, defaults?: PostingDefaults) => saved ?? defaults?.language ?? deviceLanguage();
