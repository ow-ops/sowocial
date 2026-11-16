import { dehydrate, QueryClient, type InfiniteData } from '@tanstack/react-query';

import { patchStatus, removeStatus } from '@/api/cache';
import { accountOf, keys } from '@/api/keys';
import { dehydrateOptions, setInitialAccount } from '@/api/persist';
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

const ACTIVE = 'account.mine.test.1';
const OTHER = 'account.other.test.2';

const like = (p: Post) => ({ ...p, counts: { ...p.counts, likes: p.counts.likes + 1 } });

describe('account-scoped keys', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  });

  it('starts every account key with its account', () => {
    expect(keys.status(ACTIVE, '1')).toEqual([{ account: ACTIVE }, 'status', '1']);
    expect(accountOf(keys.relationship(OTHER, '1'))).toBe(OTHER);
    expect(accountOf(keys.linkPreview('https://x.test'))).toBeUndefined();
  });

  it('stores the same id from two accounts as two cache entries', () => {
    client.setQueryData(keys.status(ACTIVE, '1'), status('1', 1));
    client.setQueryData(keys.status(OTHER, '1'), status('1', 9));
    expect(client.getQueryCache().findAll({ queryKey: keys.statuses(ACTIVE) })).toHaveLength(1);
    expect(client.getQueryData<Post>(keys.status(ACTIVE, '1'))?.counts.likes).toBe(1);
    expect(client.getQueryData<Post>(keys.status(OTHER, '1'))?.counts.likes).toBe(9);
  });

  it("persists only the cached account's entries", () => {
    setInitialAccount(ACTIVE);
    client.setQueryData(keys.credentials(ACTIVE), { id: 'mine' });
    client.setQueryData(keys.credentials(OTHER), { id: 'theirs' });
    client.setQueryData(keys.instance(ACTIVE), { domain: 'mine' });
    client.setQueryData(keys.instance(OTHER), { domain: 'theirs' });
    client.setQueryData<InfiniteData<Post[]>>(keys.timeline(OTHER, 'home'), { pages: [[]], pageParams: [undefined] });
    const persisted = dehydrate(client, dehydrateOptions).queries.map((q) => q.queryKey);
    expect(persisted).toEqual([keys.credentials(ACTIVE), keys.instance(ACTIVE)]);
  });

  it("patchStatus changes only the acting account's copies", () => {
    client.setQueryData(keys.status(ACTIVE, '1'), status('1', 1));
    client.setQueryData(keys.status(OTHER, '1'), status('1', 9));
    client.setQueryData(keys.thread(OTHER, '1'), { ancestors: [status('1', 9)], descendants: [] });
    patchStatus(client, OTHER, '1', like);
    expect(client.getQueryData<Post>(keys.status(ACTIVE, '1'))?.counts.likes).toBe(1);
    expect(client.getQueryData<Post>(keys.status(OTHER, '1'))?.counts.likes).toBe(10);
    expect(client.getQueryData<{ ancestors: Post[] }>(keys.thread(OTHER, '1'))?.ancestors[0].counts.likes).toBe(10);
  });

  it('follows the stamped owner of a post over the list it sits in', () => {
    client.setQueryData<InfiniteData<Post[]>>(keys.timeline(ACTIVE, 'home'), {
      pages: [[status('1'), { ...status('2'), accountKey: OTHER }]],
      pageParams: [undefined],
    });
    patchStatus(client, OTHER, '2', like);
    patchStatus(client, OTHER, '1', like);
    const page = client.getQueryData<InfiniteData<Post[]>>(keys.timeline(ACTIVE, 'home'))!.pages[0];
    expect(page.map((p) => p.counts.likes)).toEqual([0, 1]);
  });

  it("removeStatus drops only the acting account's copy", () => {
    client.setQueryData(keys.status(ACTIVE, '1'), status('1'));
    client.setQueryData(keys.status(OTHER, '1'), status('1'));
    removeStatus(client, ACTIVE, '1');
    expect(client.getQueryData(keys.status(ACTIVE, '1'))).toBeUndefined();
    expect(client.getQueryData(keys.status(OTHER, '1'))).toBeDefined();
  });
});
