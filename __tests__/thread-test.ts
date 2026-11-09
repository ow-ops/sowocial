import { withDepth } from '@/utils/thread';

it('assigns depth from replyTo in depth-first order', () => {
  const replies = [
    { id: 'a', replyTo: { id: 'root' } },
    { id: 'b', replyTo: { id: 'a' } },
    { id: 'c', replyTo: { id: 'b' } },
    { id: 'd', replyTo: { id: 'root' } },
    { id: 'e', replyTo: { id: 'unknown' } },
  ];
  expect(withDepth('root', replies).map((r) => [r.status.id, r.depth])).toEqual([
    ['a', 0],
    ['b', 1],
    ['c', 2],
    ['d', 0],
    ['e', 0],
  ]);
});
