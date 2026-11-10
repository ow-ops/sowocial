import { singleFlight } from '@/api/single-flight';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('singleFlight', () => {
  it('runs once for concurrent calls and once more for the calls made meanwhile', async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const call = singleFlight(() => gates[runs++].promise);
    call();
    call();
    call();
    expect(runs).toBe(1);
    gates[0].resolve();
    await gates[0].promise;
    await Promise.resolve();
    expect(runs).toBe(2);
    gates[1].resolve();
    await gates[1].promise;
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  it('runs again after finishing and keeps going after a failure', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let runs = 0;
    const call = singleFlight(async () => {
      runs++;
      if (runs === 1) throw new Error('boom');
    });
    call();
    await Promise.resolve();
    await Promise.resolve();
    call();
    await Promise.resolve();
    expect(runs).toBe(2);
  });
});
