import { chooseDistributor } from '@/push/delivery';
import { pushMessage, unifiedPushMessage } from '@/push/payload';

describe('pushMessage', () => {
  it('reads the relay message from the FCM data', () => {
    expect(pushMessage({ m: 'abc', dataString: null })).toBe('abc');
  });

  it('ignores pushes that are not from the relay', () => {
    expect(pushMessage({ other: 'abc' })).toBeNull();
    expect(pushMessage({ m: 1 })).toBeNull();
    expect(pushMessage(null)).toBeNull();
  });
});

describe('unifiedPushMessage', () => {
  it('reads the plaintext the UnifiedPush service forwards', () => {
    expect(unifiedPushMessage({ up: '{"title":"hi"}' })).toBe('{"title":"hi"}');
  });

  it('ignores relay pushes', () => {
    expect(unifiedPushMessage({ m: 'abc' })).toBeNull();
    expect(unifiedPushMessage(undefined)).toBeNull();
  });
});

describe('chooseDistributor', () => {
  it('keeps the saved distributor while it is installed', () => {
    expect(chooseDistributor(['a', 'b'], 'b')).toBe('b');
  });

  it('falls back to the first installed one when the saved one is gone', () => {
    expect(chooseDistributor(['a', 'b'], 'c')).toBe('a');
    expect(chooseDistributor(['a'], null)).toBe('a');
  });

  it('is null without any distributor', () => {
    expect(chooseDistributor([], 'a')).toBeNull();
  });
});
