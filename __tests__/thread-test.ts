import type { Post } from '@/model/post';
import { buildThread, MAX_DEPTH, type ThreadRow } from '@/utils/thread';

const post = (id: string, author: string, replyTo?: string, text = 'hi'): Post =>
  ({
    id,
    key: id,
    author: { id: author, handle: author },
    replyTo: replyTo ? { id: replyTo } : undefined,
    content: { kind: 'segments', segments: [{ type: 'text', text }] },
    media: [],
  }) as unknown as Post;

const long = 'x'.repeat(400);

const summary = (rows: ThreadRow[]) =>
  rows.map((r) => {
    switch (r.kind) {
      case 'missing':
        return 'missing';
      case 'hero':
        return `hero:${r.status.id}`;
      case 'post':
        return `post:${r.status.id}`;
      case 'reply':
        return `reply:${r.status.id}@${r.depth}`;
      case 'more':
        return `more:${r.parent.id}@${r.depth}:${r.count}${r.continues ? ':continue' : ''}`;
    }
  });

const hero = post('h', 'op');

it('nests replies by parent', () => {
  const rows = buildThread(hero, [], [post('a', 'x', 'h'), post('b', 'y', 'a'), post('c', 'x', 'h')], new Set(), true);
  expect(summary(rows)).toEqual(['hero:h', 'reply:a@0', 'reply:b@1', 'reply:c@0']);
});

it('keeps the author self-thread flat, before other replies', () => {
  const rows = buildThread(
    hero,
    [],
    [post('r', 'x', 'h'), post('t1', 'op', 'h'), post('t2', 'op', 't1'), post('r2', 'y', 't2')],
    new Set(),
    true,
  );
  expect(summary(rows)).toEqual(['hero:h', 'post:t1', 'post:t2', 'reply:r@0', 'reply:r2@0']);
  const [, first, second] = rows;
  expect(first).toMatchObject({ lineAbove: false, lineBelow: true });
  expect(second).toMatchObject({ lineAbove: true, lineBelow: false });
});

it('marks unavailable parents once the thread has loaded', () => {
  const ancestors = [post('p1', 'x', 'gone'), post('p2', 'y', 'p1')];
  const child = post('h', 'op', 'p2');
  expect(summary(buildThread(child, ancestors, [], new Set(), true))).toEqual(['missing', 'post:p1', 'post:p2', 'hero:h']);
  expect(summary(buildThread(post('h', 'op', 'p2'), [], [], new Set(), false))).toEqual(['hero:h']);
  expect(summary(buildThread(post('h', 'op', 'p2'), [], [], new Set(), true))).toEqual(['missing', 'hero:h']);
});

it('collapses heavy branches and expands them on request', () => {
  const descendants = [post('a', 'x', 'h', long), post('b', 'y', 'a', long), post('c', 'z', 'b'), post('d', 'w', 'a', long)];
  expect(summary(buildThread(hero, [], descendants, new Set(), true))).toEqual(['hero:h', 'reply:a@0', 'more:a@1:3']);
  expect(summary(buildThread(hero, [], descendants, new Set(['a']), true))).toEqual([
    'hero:h',
    'reply:a@0',
    'reply:b@1',
    'reply:c@2',
    'reply:d@1',
  ]);
});

it('keeps a single short reply open', () => {
  const rows = buildThread(hero, [], [post('a', 'x', 'h', long), post('b', 'y', 'a', long), post('c', 'z', 'b')], new Set(), true);
  expect(summary(rows)).toEqual(['hero:h', 'reply:a@0', 'more:a@1:2']);
  const short = buildThread(hero, [], [post('a', 'x', 'h', long), post('b', 'y', 'a')], new Set(), true);
  expect(summary(short)).toEqual(['hero:h', 'reply:a@0', 'reply:b@1']);
});

it('hands deep branches off to their own thread page', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const descendants = ids.map((id, i) => post(id, `u${i}`, i === 0 ? 'h' : ids[i - 1]));
  const rows = buildThread(hero, [], descendants, new Set(ids), true);
  expect(summary(rows)).toEqual(['hero:h', 'reply:a@0', 'reply:b@1', 'reply:c@2', 'reply:d@3', `more:d@${MAX_DEPTH + 1}:2:continue`]);
});

it('draws rails only where a branch continues', () => {
  const rows = buildThread(
    hero,
    [],
    [post('a', 'x', 'h'), post('b', 'y', 'a'), post('c', 'z', 'b'), post('d', 'w', 'a'), post('e', 'v', 'h')],
    new Set(),
    true,
  );
  const rails = rows.flatMap((r) => (r.kind === 'reply' ? [[r.status.id, r.rails, r.lineBelow, r.separator]] : []));
  expect(rails).toEqual([
    ['a', [], true, false],
    ['b', [true], true, false],
    ['c', [true, false], false, false],
    ['d', [false], false, true],
    ['e', [], false, true],
  ]);
});
