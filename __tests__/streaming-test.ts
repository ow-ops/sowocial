import type { InfiniteData } from '@tanstack/react-query';

jest.mock('@/auth/session', () => ({}));

import { mergePending } from '@/api/pending';
import { pollingFallback } from '@/api/polling-fallback';
import type { Post } from '@/model/post';

const status = (id: string) => ({ id, cursor: id, key: `ap:${id}` }) as Post;

describe('mergePending', () => {
  it('puts waiting posts on top without duplicating ones a refetch brought in', () => {
    const data: InfiniteData<Post[]> = { pages: [[status('2'), status('1')], [status('0')]], pageParams: [undefined, '1'] };
    const merged = mergePending(data, [status('4'), status('3'), status('2')]);
    expect(merged.pages.map((p) => p.map((s) => s.cursor))).toEqual([['4', '3', '2', '1'], ['0']]);
  });
});

describe('pollingFallback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('starts polling when the socket never opens', () => {
    const run = jest.fn();
    const fallback = pollingFallback(run, 1000, 500);
    jest.advanceTimersByTime(499);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(3);
    fallback.stop();
  });

  it('stays idle while open, and resumes when the socket drops', () => {
    const run = jest.fn();
    const fallback = pollingFallback(run, 1000, 500);
    fallback.setOpen(true);
    jest.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
    fallback.setOpen(false);
    jest.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(1);
    fallback.setOpen(true);
    jest.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
    fallback.stop();
  });

  it('keeps polling while open when a catch-up is failing', () => {
    const run = jest.fn();
    const fallback = pollingFallback(run, 1000, 500);
    fallback.setOpen(true);
    fallback.setFailed(true);
    jest.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(2);
    fallback.stop();
  });
});
