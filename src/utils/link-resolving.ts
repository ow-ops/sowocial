let active: number | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function set(next: number | null) {
  active = next;
  listeners.forEach((listener) => listener());
}

export const linkResolving = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  isActive: () => active !== null,
  start() {
    if (active !== null) return null;
    set(++counter);
    return counter;
  },
  finish(token: number) {
    if (active !== token) return false;
    set(null);
    return true;
  },
  cancel() {
    if (active !== null) set(null);
  },
};
