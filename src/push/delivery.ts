export function chooseDistributor(available: string[], saved: string | null): string | null {
  if (saved && available.includes(saved)) return saved;
  return available[0] ?? null;
}
