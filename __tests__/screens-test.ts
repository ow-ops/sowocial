import { AP_CAPABILITIES, BSKY_CAPABILITIES } from '@/api/backend/capabilities';
import { ALWAYS_AVAILABLE, CAPABILITY_SCREENS, reachableScreens } from '@/api/backend/screens';

type Entry = { name: string; isDirectory(): boolean };
// The project has no node typings, so only the one call this test needs is described.
const { readdirSync } = jest.requireActual<{ readdirSync(dir: string, options: { withFileTypes: true }): Entry[] }>('fs');

const APP = `${process.cwd()}/src/app`;

// Skipped: _layout (navigator config), +not-found and +native-intent (router special files),
// and (tabs), whose screens are tab content gated by the tab bar rather than the root stack.
function routeFiles(dir = APP, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '(tabs)') return [];
    if (entry.isDirectory()) return routeFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`);
    const name = entry.name.replace(/\.tsx?$/, '');
    return name === '_layout' || name.startsWith('+') ? [] : [`${prefix}${name}`];
  });
}

describe('app screens', () => {
  const routes = routeFiles();
  const known = [...Object.keys(CAPABILITY_SCREENS), ...ALWAYS_AVAILABLE];

  it('decides who can use every route file', () => {
    expect(routes.filter((route) => !known.includes(route))).toEqual([]);
  });

  it('names only route files that exist', () => {
    expect(known.filter((name) => !routes.includes(name))).toEqual([]);
  });

  it('lists each screen once', () => {
    expect(new Set(known).size).toBe(known.length);
  });

  it('reaches these screens on the fediverse', () => {
    expect(reachableScreens(AP_CAPABILITIES)).toEqual([
      'federated',
      'followed-tags',
      'follow-requests',
      'scheduled',
      'instance/[domain]',
      'moderation/index',
      'moderation/[id]',
      'status-history/[id]',
      'settings/filters/index',
      'settings/filters/[id]',
      'settings/server',
      'settings/announcements',
      'settings/muted',
      'settings/blocked',
      'settings/blocked-domains',
      'lists/index',
      'lists/[id]',
      'lists/add/[accountId]',
      'lists/manage/[id]',
      'saved/[kind]',
      'profile/edit',
      'trending',
    ]);
  });

  it('reaches these screens on Bluesky', () => {
    expect(reachableScreens(BSKY_CAPABILITIES)).toEqual([
      'lists/index',
      'lists/[id]',
      'lists/add/[accountId]',
      'lists/manage/[id]',
      'saved/[kind]',
      'profile/edit',
      'trending',
      'feeds/index',
      'feeds/[id]',
      'feeds/info/[id]',
      'settings/services',
      'settings/muted-words',
      'settings/moderation-lists',
      'starter-pack/[id]',
      'starter-pack/create',
    ]);
  });
});
