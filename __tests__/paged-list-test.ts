import { nextPage } from '@/api/paged-list';

const pagesOf = (...pages: string[][]) => {
  const create = jest.fn(async function* () {
    yield* pages;
  });
  return create;
};

describe('nextPage', () => {
  it('continues the iterator it already holds for the next page', async () => {
    const create = pagesOf(['a'], ['b'], ['c']);
    expect(await nextPage(['list'], create, 0)).toEqual(['a']);
    expect(await nextPage(['list'], create, 1)).toEqual(['b']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('replays to a later page when no iterator is at it, as after a restored cache', async () => {
    const create = pagesOf(['a'], ['b'], ['c']);
    expect(await nextPage(['restored'], create, 2)).toEqual(['c']);
  });

  it('starts over when the first page is fetched again', async () => {
    const create = pagesOf(['a'], ['b']);
    await nextPage(['again'], create, 0);
    await nextPage(['again'], create, 1);
    expect(await nextPage(['again'], create, 0)).toEqual(['a']);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not share an iterator between lists', async () => {
    const first = pagesOf(['x']);
    const second = pagesOf(['y']);
    await nextPage(['one'], first, 0);
    expect(await nextPage(['two'], second, 0)).toEqual(['y']);
  });

  it('returns an empty page once the iterator is done', async () => {
    const create = pagesOf(['a']);
    await nextPage(['done'], create, 0);
    expect(await nextPage(['done'], create, 1)).toEqual([]);
  });
});
