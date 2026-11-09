import { pushMessage } from '@/push/payload';

describe('pushMessage', () => {
  it('finds the relay message however the platform delivers it', () => {
    expect(pushMessage({ dataString: JSON.stringify({ m: 'abc' }) })).toBe('abc');
    expect(pushMessage({ body: { m: 'abc' } })).toBe('abc');
    expect(pushMessage({ m: 'abc' })).toBe('abc');
  });

  it('ignores pushes that are not from the relay', () => {
    expect(pushMessage({ dataString: 'not json' })).toBeNull();
    expect(pushMessage({ dataString: JSON.stringify({ other: 1 }) })).toBeNull();
    expect(pushMessage(null)).toBeNull();
  });
});
