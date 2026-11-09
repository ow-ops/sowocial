import type { InfiniteData } from '@tanstack/react-query';

jest.mock('@/auth/session', () => ({}));

import { mergePending } from '@/api/pending';
import type { Post } from '@/model/post';

const status = (id: string) => ({ id, cursor: id, key: `ap:${id}` }) as Post;

describe('mergePending', () => {
  it('puts waiting posts on top without duplicating ones a refetch brought in', () => {
    const data: InfiniteData<Post[]> = { pages: [[status('2'), status('1')], [status('0')]], pageParams: [undefined, '1'] };
    const merged = mergePending(data, [status('4'), status('3'), status('2')]);
    expect(merged.pages.map((p) => p.map((s) => s.cursor))).toEqual([['4', '3', '2', '1'], ['0']]);
  });
});
