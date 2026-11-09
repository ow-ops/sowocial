export const POLL_INTERVAL = 60_000;
export const MAX_POLL_INTERVAL = 300_000;

export const nextPollDelay = (failures: number) => Math.min(POLL_INTERVAL * 2 ** failures, MAX_POLL_INTERVAL);

export function startPolling(run: () => Promise<void>) {
  let failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const tick = async () => {
    try {
      await run();
      failures = 0;
    } catch (error) {
      failures += 1;
      console.warn('Polling failed', error);
    }
    if (!stopped) timer = setTimeout(tick, nextPollDelay(failures));
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
