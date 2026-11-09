import { loopbackIpHref } from './bsky-oauth-config';
import { buildMigrationFragment, mergeMigration, MIGRATE_PARAM, parseMigrationFragment } from './loopback-migration';

export function handOffToLoopback(location: Pick<Location, 'href' | 'hostname' | 'origin' | 'port'>) {
  const href = loopbackIpHref(location);
  if (!href) return null;
  const fragment = buildMigrationFragment(localStorage);
  return fragment ? `${href.replace(/#.*$/, '')}${fragment}` : href;
}

export function receiveLoopbackHandoff() {
  if (window.location.hostname !== '127.0.0.1' || !window.location.hash.startsWith(`#${MIGRATE_PARAM}=`)) return;
  const entries = parseMigrationFragment(window.location.hash);
  if (entries) mergeMigration(localStorage, entries);
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', pathname + search);
}
