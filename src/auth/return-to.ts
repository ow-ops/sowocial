import { Platform } from 'react-native';

// Routes a signed-out visitor can open, so there is nothing to come back to.
const PUBLIC_PATHS = new Set(['/', '/login', '/sign-up', '/oauth', '/oauth/callback']);

// Web sign-in reloads the page, so the path also waits in sessionStorage.
const KEY = 'return-to';
const saved = Platform.OS === 'web' ? sessionStorage : null;

let target: string | null = saved?.getItem(KEY) ?? null;

// Only a path inside the app: no scheme, no host, no protocol-relative or backslash tricks.
export function isRestorable(href: string) {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return false;
  return !PUBLIC_PATHS.has(href.split(/[?#]/)[0]);
}

export function rememberReturnTo(href: string) {
  if (!isRestorable(href)) return;
  target = href;
  saved?.setItem(KEY, href);
}

export const returnTo = () => target;

export function clearReturnTo() {
  target = null;
  saved?.removeItem(KEY);
}
