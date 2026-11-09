import { MAX_POLL_INTERVAL, nextPollDelay, POLL_INTERVAL } from '@/api/poll-backoff';

describe('nextPollDelay', () => {
  it('keeps the base interval until a failure, then doubles up to the cap', () => {
    expect(nextPollDelay(0)).toBe(POLL_INTERVAL);
    expect(nextPollDelay(1)).toBe(POLL_INTERVAL * 2);
    expect(nextPollDelay(2)).toBe(POLL_INTERVAL * 4);
    expect(nextPollDelay(10)).toBe(MAX_POLL_INTERVAL);
  });
});
