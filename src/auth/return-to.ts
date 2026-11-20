// Routes a signed-out visitor can open, so there is nothing to come back to.
const PUBLIC_PATHS = new Set(['/', '/login', '/sign-up', '/oauth', '/oauth/callback']);

let target: string | null = null;

// Only a path inside the app: no scheme, no host, no protocol-relative or backslash tricks.
export function isRestorable(href: string) {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return false;
  return !PUBLIC_PATHS.has(href.split(/[?#]/)[0]);
}

export function rememberReturnTo(href: string) {
  if (isRestorable(href)) target = href;
}

export const returnTo = () => target;

export function clearReturnTo() {
  target = null;
}
