export function domainOf(acct: string): string | null {
  const at = acct.indexOf('@');
  return at === -1 ? null : acct.slice(at + 1);
}

export function fullHandle(acct: string, localDomain: string | undefined) {
  return domainOf(acct) || !localDomain ? acct : `${acct}@${localDomain}`;
}
