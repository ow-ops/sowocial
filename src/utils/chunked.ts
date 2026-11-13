const CHUNK = 5;

export const chunked = <T>(items: Iterable<T>): T[][] => {
  const all = [...items];
  return Array.from({ length: Math.ceil(all.length / CHUNK) }, (_, i) => all.slice(i * CHUNK, (i + 1) * CHUNK));
};
