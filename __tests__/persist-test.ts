import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { keys } from '@/api/keys';
import { deleteAccountCache, dehydrateOptions } from '@/api/persist';

describe('persisted timelines', () => {
  const post = (id: string) => ({ id, raw: { bsky: { big: 'payload' } }, author: { id: 'a', raw: { bsky: {} } }, quote: { id: 'q', raw: {} } });

  it('keeps only the first page and drops raw objects at every depth', () => {
    const data: InfiniteData<unknown> = {
      pages: [{ items: [post('1'), post('2')], next: '2' }, { items: [post('3')] }],
      pageParams: [undefined, 'cursor'],
    };
    expect(dehydrateOptions.serializeData(data)).toEqual({
      pages: [
        {
          items: [
            { id: '1', author: { id: 'a' }, quote: { id: 'q' } },
            { id: '2', author: { id: 'a' }, quote: { id: 'q' } },
          ],
          next: '2',
        },
      ],
      pageParams: [undefined],
    });
  });

  it('leaves other queries alone', () => {
    const account = { id: '1', raw: 'kept' };
    expect(dehydrateOptions.serializeData(account)).toBe(account);
  });
});

describe('deleteAccountCache', () => {
  it('drops the mixed timeline that pairs the account, whichever account it is filed under', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.mixedTimeline('ap', 'bsky'), { pages: [], pageParams: [] });
    client.setQueryData(keys.mixedTimeline('ap', 'other'), { pages: [], pageParams: [] });
    client.setQueryData(keys.timeline('ap', 'home'), { pages: [], pageParams: [] });
    await deleteAccountCache(client, 'bsky');
    expect(client.getQueryData(keys.mixedTimeline('ap', 'bsky'))).toBeUndefined();
    expect(client.getQueryData(keys.mixedTimeline('ap', 'other'))).toBeDefined();
    expect(client.getQueryData(keys.timeline('ap', 'home'))).toBeDefined();
    await deleteAccountCache(client, 'ap');
    expect(client.getQueryData(keys.mixedTimeline('ap', 'other'))).toBeUndefined();
    client.clear();
  });
});
