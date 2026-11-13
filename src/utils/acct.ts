export function domainOf(acct: string): string | null {
  const at = acct.indexOf('@');
  return at === -1 ? null : acct.slice(at + 1);
}

export function fullHandle(acct: string, localDomain: string | undefined) {
  return domainOf(acct) || !localDomain ? acct : `${acct}@${localDomain}`;
}

const BARE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export const bareDomain = (text: string) => (BARE_DOMAIN.test(text) ? text.toLowerCase() : null);
