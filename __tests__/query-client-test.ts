import { dehydrate, hydrate } from '@tanstack/react-query';

import { keys } from '@/api/keys';
import { PERSIST_MAX_AGE } from '@/api/persist';
import { createQueryClient } from '@/api/query-client';

jest.mock('@/utils/toast', () => ({ showError: jest.fn() }));

const account = 'a@example.com';
const gcTimeOf = (client: ReturnType<typeof createQueryClient>, queryKey: readonly unknown[]) =>
  client.getQueryCache().find({ queryKey })?.gcTime;

const clients: ReturnType<typeof createQueryClient>[] = [];
const newClient = () => {
  const client = createQueryClient();
  clients.push(client);
  return client;
};

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe('query garbage collection', () => {
  it('keeps persisted roots for the persist max age and everything else for the default', () => {
    const client = newClient();
    const persisted = [keys.timeline(account, 'home'), keys.lists(account), keys.credentials(account), keys.notificationList(account, 'all')];
    const transient = [keys.search(account, 'cats'), keys.thread(account, '1'), keys.linkedPost(account, 'https://x.test')];
    for (const queryKey of [...persisted, ...transient]) client.setQueryData(queryKey, 'x');

    for (const queryKey of persisted) expect(gcTimeOf(client, queryKey)).toBe(PERSIST_MAX_AGE);
    for (const queryKey of transient) expect(gcTimeOf(client, queryKey)).toBe(5 * 60 * 1000);
  });

  it('gives restored queries the persist max age too', () => {
    const source = newClient();
    source.setQueryData(keys.timeline(account, 'home'), 'x');
    const restored = newClient();
    hydrate(restored, dehydrate(source));

    expect(gcTimeOf(restored, keys.timeline(account, 'home'))).toBe(PERSIST_MAX_AGE);
  });
});
