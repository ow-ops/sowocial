import type { InfiniteData } from '@tanstack/react-query';

import { dehydrateOptions } from '@/api/persist';

describe('persisted timelines', () => {
  const post = (id: string) => ({ id, raw: { bsky: { big: 'payload' } }, author: { id: 'a', raw: { bsky: {} } }, quote: { id: 'q', raw: {} } });

  it('keeps only the first page and drops raw objects at every depth', () => {
    const data: InfiniteData<unknown> = {
      pages: [[post('1'), post('2')], [post('3')]],
      pageParams: [undefined, 'cursor'],
    };
    expect(dehydrateOptions.serializeData(data)).toEqual({
      pages: [[{ id: '1', author: { id: 'a' }, quote: { id: 'q' } }, { id: '2', author: { id: 'a' }, quote: { id: 'q' } }]],
      pageParams: [undefined],
    });
  });

  it('leaves other queries alone', () => {
    const account = { id: '1', raw: 'kept' };
    expect(dehydrateOptions.serializeData(account)).toBe(account);
  });
});
