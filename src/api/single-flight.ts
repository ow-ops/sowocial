// Calls made while one is running collapse into a single follow-up run.
export function singleFlight(run: () => Promise<unknown>) {
  let running = false;
  let again = false;
  const start = async () => {
    running = true;
    try {
      await run();
    } catch (error) {
      console.warn('Background refresh failed', error);
    } finally {
      running = false;
      if (again) {
        again = false;
        void start();
      }
    }
  };
  return () => {
    if (running) again = true;
    else void start();
  };
}
