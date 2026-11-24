import { unreadAbove } from '@/hooks/use-home-resume';
import type { Post } from '@/model/post';

jest.mock('expo-router', () => ({}));
jest.mock('@/hooks/use-column', () => ({}));

const post = (id: string) => ({ key: id, cursor: id }) as Post;
const positionOf = (p: Post) => p.cursor;
const START = '100';

describe('unread posts above the one reached', () => {
  const items = ['104', '103', '102', '101', '100', '99'].map(post);

  it('counts the newer posts above the reached post', () => {
    expect(unreadAbove(items, '101', START, positionOf)).toBe(3);
  });

  it('still counts them after newer posts load above', () => {
    const prepended = [post('106'), post('105'), ...items];
    expect(unreadAbove(prepended, '101', START, positionOf)).toBe(5);
  });

  it('is zero at the top, without a start, or once the reached post is gone', () => {
    expect(unreadAbove(items, '104', START, positionOf)).toBe(0);
    expect(unreadAbove(items, '101', null, positionOf)).toBe(0);
    expect(unreadAbove(items, 'gone', START, positionOf)).toBe(0);
  });
});
