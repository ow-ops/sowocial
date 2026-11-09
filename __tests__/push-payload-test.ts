import { pushMessage } from '@/push/payload';

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
