import { QueryClient, type InfiniteData } from '@tanstack/react-query';

jest.mock('@/auth/session', () => ({}));
jest.mock('@/utils/toast', () => ({ showError: jest.fn() }));
jest.mock('@/api/backend', () => ({}));
jest.mock('@/api/clients', () => ({}));
jest.mock('@/api/ap/backend', () => ({}));

import { keys } from '@/api/keys';
import { getPending, PENDING_LIMIT, setPending, showPending } from '@/api/pending';
import { pollSource } from '@/api/polling';
import type { LiveSource } from '@/api/timeline-source';
import type { Page } from '@/model/page';
import type { Post } from '@/model/post';

const post = (id: string, at: number, protocol: Post['protocol'] = 'ap') =>
  ({ id, cursor: id, key: `${protocol}:${id}`, protocol, sortAt: new Date(at).toISOString() }) as Post;

const HOME = keys.timeline('account.a', 'home');

const sourceOf = (queryKey: LiveSource['queryKey'], overrides: Partial<LiveSource> = {}): LiveSource => ({
  queryKey,
  refresh: jest.fn(async () => undefined),
  latest: async () => [],
  mergesWaiting: true,
  ...overrides,
});

describe('live timeline sources', () => {
  let client: QueryClient;
  const seed = (queryKey: LiveSource['queryKey'], items: Post[], pageParams: (string | undefined)[] = [undefined]) =>
    client.setQueryData<InfiniteData<Page<Post>>>(queryKey, { pages: [{ items, next: 'older' }], pageParams });
  const items = () => client.getQueryData<InfiniteData<Page<Post>>>(HOME)!.pages[0].items.map((p) => p.id);

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    setPending(HOME, []);
  });

  it('keeps waiting posts apart per account', () => {
    setPending(keys.timeline('account.a', 'home'), [post('2', 2000)]);
    expect(getPending(keys.timeline('account.b', 'home'))).toEqual([]);
    expect(getPending(keys.timeline('account.a', 'home')).map((p) => p.id)).toEqual(['2']);
  });

  describe('showPending', () => {
    it('puts the waiting posts on the first page and empties the buffer', () => {
      const source = sourceOf(HOME);
      seed(HOME, [post('1', 1000)]);
      setPending(HOME, [post('2', 2000)]);
      showPending(client, source);
      expect(items()).toEqual(['2', '1']);
      expect(getPending(HOME)).toEqual([]);
      expect(source.refresh).not.toHaveBeenCalled();
    });

    it('catches up from the server when the buffer overflowed', () => {
      const source = sourceOf(HOME);
      seed(HOME, [post('1', 1000)]);
      setPending(HOME, Array.from({ length: PENDING_LIMIT }, (_, i) => post(`w${i}`, 2000 + i)));
      showPending(client, source);
      expect(source.refresh).toHaveBeenCalledTimes(1);
      expect(items()).toEqual(['1']);
    });

    it('catches up when the list no longer starts at the newest post', () => {
      const source = sourceOf(HOME);
      seed(HOME, [post('1', 1000)], ['cursor']);
      setPending(HOME, [post('2', 2000)]);
      showPending(client, source);
      expect(source.refresh).toHaveBeenCalledTimes(1);
    });

    it('always catches up for a source that cannot merge waiting posts', () => {
      const source = sourceOf(HOME, { mergesWaiting: false });
      seed(HOME, [post('1', 1000)]);
      setPending(HOME, [post('2', 2000)]);
      showPending(client, source);
      expect(source.refresh).toHaveBeenCalledTimes(1);
      expect(getPending(HOME)).toEqual([]);
    });
  });

  describe('pollSource', () => {
    it('does nothing before the list has a post', async () => {
      const latest = jest.fn(async () => [post('2', 2000)]);
      await pollSource(client, sourceOf(HOME, { latest }));
      expect(latest).not.toHaveBeenCalled();
    });

    it('holds posts newer than the top and skips ones already shown or waiting', async () => {
      seed(HOME, [post('1', 1000)]);
      setPending(HOME, [post('3', 3000)]);
      const latest = async () => [post('4', 4000), post('3', 3000), post('2', 2000), post('1', 1000)];
      await pollSource(client, sourceOf(HOME, { latest }));
      expect(getPending(HOME).map((p) => p.id)).toEqual(['4', '3', '2']);
    });

    it('judges each network by its own newest post', async () => {
      seed(HOME, [post('b9', 9000, 'bsky'), post('5', 5000)]);
      const latest = async () => [post('6', 6000), post('b9', 9000, 'bsky'), post('b8', 8000, 'bsky')];
      await pollSource(client, sourceOf(HOME, { latest }));
      expect(getPending(HOME).map((p) => p.key)).toEqual(['ap:6']);
    });
  });
});
