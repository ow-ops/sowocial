import type { InfiniteData } from '@tanstack/react-query';

import type { Post } from '@/model/post';
import { arrangeTimeline, type TimelinePost } from '@/utils/timeline';

type Spec = { id: string; replyTo?: string; boostOf?: string; gap?: boolean; protocol?: 'ap' | 'bsky' };

const post = ({ id, replyTo, boostOf, gap, protocol = 'ap' }: Spec): Post =>
  ({
    id: boostOf ?? id,
    key: id,
    uid: `${protocol}:${boostOf ?? id}`,
    cursor: id,
    protocol,
    author: { id: 'a', handle: 'a' },
    replyTo: replyTo ? { id: replyTo } : undefined,
    repostedBy: boostOf ? { id: 'b', handle: 'b' } : undefined,
    gap: gap ? { sinceId: 'x' } : undefined,
  }) as unknown as Post;

const data = (...pages: Spec[][]): InfiniteData<{ items: Post[] }> => ({
  pages: pages.map((p) => ({ items: p.map(post) })),
  pageParams: pages.map(() => undefined),
});

const shape = (result: InfiniteData<TimelinePost[]>) =>
  result.pages.map((page) =>
    page.map((p) => `${p.key}${p.joined?.above ? '^' : ''}${p.joined?.below ? 'v' : ''}`),
  );

it('shows an adjacent reply chain oldest first, joined', () => {
  const result = arrangeTimeline(data([{ id: 'x' }, { id: 'c', replyTo: 'b' }, { id: 'b', replyTo: 'a' }, { id: 'a' }, { id: 'y' }]));
  expect(shape(result)).toEqual([['x', 'av', 'b^v', 'c^', 'y']]);
});

it('records the newest post of a chain and leaves each cursor its own', () => {
  const result = arrangeTimeline(data([{ id: 'b', replyTo: 'a' }, { id: 'a' }]));
  expect(result.pages[0].map((p) => p.joined?.newest)).toEqual(['b', 'b']);
  expect(result.pages[0].map((p) => p.cursor)).toEqual(['a', 'b']);
});

it('does not join boosts, gaps, other networks, or across pages', () => {
  const result = arrangeTimeline(
    data(
      [
        { id: 'r1', boostOf: 'p', replyTo: 'q' },
        { id: 'q' },
        { id: 'g', replyTo: 'h', gap: true },
        { id: 'h' },
        { id: 'm', replyTo: 'n', protocol: 'bsky' },
        { id: 'n' },
        { id: 'z', replyTo: 'w' },
      ],
      [{ id: 'w' }],
    ),
  );
  expect(shape(result)).toEqual([['r1', 'q', 'g', 'h', 'm', 'n', 'z'], ['w']]);
});

it('drops a boost of a post already shown above it', () => {
  const result = arrangeTimeline(
    data([{ id: 'p' }, { id: 'r1', boostOf: 'p' }, { id: 'r2', boostOf: 's' }], [{ id: 'r3', boostOf: 's' }, { id: 'r4', boostOf: 'p', gap: true }]),
  );
  expect(shape(result)).toEqual([['p', 'r2'], ['r4']]);
});

it('numbers a chain only when one author wrote all of it', () => {
  const result = arrangeTimeline(data([{ id: 'b', replyTo: 'a' }, { id: 'a' }]));
  expect(result.pages[0].map((p) => p.joined?.part)).toEqual([
    { index: 1, total: 2 },
    { index: 2, total: 2 },
  ]);
});
