import { dehydrate, QueryClient, type InfiniteData } from '@tanstack/react-query';

import { patchStatus, removeStatus } from '@/api/cache';
import { foreignAccountOf, keys, scoped } from '@/api/keys';
import { dehydrateOptions } from '@/api/persist';
import type { Post } from '@/model/post';

const status = (id: string, likes = 0) =>
  ({
    id,
    uid: `ap:${id}`,
    key: `ap:${id}`,
    cursor: id,
    viewer: { liked: false, reposted: false },
    counts: { replies: 0, reposts: 0, likes },
    raw: {},
  }) as unknown as Post;

const FOREIGN = 'ap:https://other.test:2';

describe('account-scoped keys', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  });

  it('keeps the active account key shape and appends the owner for another account', () => {
    expect(keys.status('1')).toEqual(['status', '1']);
    expect(keys.status('1', FOREIGN)).toEqual(['status', '1', { account: FOREIGN }]);
    expect(keys.thread('1', FOREIGN)).toEqual(['thread', '1', { account: FOREIGN }]);
    expect(foreignAccountOf(keys.relationship('1', FOREIGN))).toBe(FOREIGN);
    expect(foreignAccountOf(keys.relationship('1'))).toBeUndefined();
  });

  it('stores the same id from two accounts as two cache entries', () => {
    client.setQueryData(keys.status('1'), status('1', 1));
    client.setQueryData(keys.status('1', FOREIGN), status('1', 9));
    expect(client.getQueryCache().findAll({ queryKey: keys.statuses })).toHaveLength(2);
    expect(client.getQueryData<Post>(keys.status('1'))?.counts.likes).toBe(1);
    expect(client.getQueryData<Post>(keys.status('1', FOREIGN))?.counts.likes).toBe(9);
  });

  it('never persists foreign entries', () => {
    client.setQueryData(keys.credentials, { id: 'mine' });
    client.setQueryData(scoped(keys.credentials, FOREIGN), { id: 'theirs' });
    client.setQueryData(keys.instance, { domain: 'mine' });
    client.setQueryData(scoped(keys.instance, FOREIGN), { domain: 'theirs' });
    client.setQueryData<InfiniteData<Post[]>>(scoped(['timeline', 'home'] as const, FOREIGN), { pages: [[]], pageParams: [undefined] });
    const persisted = dehydrate(client, dehydrateOptions).queries.map((q) => q.queryKey);
    expect(persisted).toEqual([keys.credentials, keys.instance]);
  });

  it('patchStatus updates the active and the foreign copy', () => {
    client.setQueryData(keys.status('1'), status('1', 1));
    client.setQueryData(keys.status('1', FOREIGN), status('1', 9));
    client.setQueryData(keys.thread('1', FOREIGN), { ancestors: [status('1', 9)], descendants: [] });
    patchStatus(client, '1', (p) => ({ ...p, counts: { ...p.counts, likes: p.counts.likes + 1 } }));
    expect(client.getQueryData<Post>(keys.status('1'))?.counts.likes).toBe(2);
    expect(client.getQueryData<Post>(keys.status('1', FOREIGN))?.counts.likes).toBe(10);
    expect(client.getQueryData<{ ancestors: Post[] }>(keys.thread('1', FOREIGN))?.ancestors[0].counts.likes).toBe(10);
  });

  it('removeStatus drops both copies', () => {
    client.setQueryData(keys.status('1'), status('1'));
    client.setQueryData(keys.status('1', FOREIGN), status('1'));
    removeStatus(client, '1');
    expect(client.getQueryCache().findAll({ queryKey: keys.statuses })).toHaveLength(0);
  });
});
