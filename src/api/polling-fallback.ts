// Polls while the socket has not been open for `grace`, or while a catch-up is failing; idle otherwise.
export function pollingFallback(run: () => void, interval: number, grace: number) {
  let open = false;
  let failed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const start = (immediate: boolean) => {
    if (timer) return;
    timer = setInterval(run, interval);
    if (immediate) run();
  };
  const update = () => {
    if (stopped) return;
    clearTimeout(waiting);
    waiting = undefined;
    if (failed) return start(false);
    if (open) {
      clearInterval(timer);
      timer = undefined;
    } else if (!timer) {
      waiting = setTimeout(() => start(true), grace);
    }
  };
  update();
  return {
    setOpen(value: boolean) {
      open = value;
      update();
    },
    setFailed(value: boolean) {
      failed = value;
      update();
    },
    stop() {
      stopped = true;
      clearTimeout(waiting);
      clearInterval(timer);
      timer = undefined;
    },
  };
}
