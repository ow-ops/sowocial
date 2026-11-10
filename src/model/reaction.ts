export type Reaction = { name: string; count: number; me: boolean; url?: string };

type RawReaction = { name?: string; count?: number; me?: boolean; url?: string; staticUrl?: string };

export function toReactions(raw: RawReaction[] | undefined | null): Reaction[] | undefined {
  const list = (raw ?? []).filter((r): r is RawReaction & { name: string } => !!r.name && !!r.count);
  return list.length ? list.map((r) => ({ name: r.name, count: r.count!, me: !!r.me, url: r.url || r.staticUrl || undefined })) : undefined;
}

export function applyReaction(reactions: Reaction[] | undefined, name: string, on: boolean, url?: string): Reaction[] | undefined {
  const list = reactions ?? [];
  const found = list.some((r) => r.name === name);
  const next = found
    ? list.map((r) => (r.name === name ? { ...r, me: on, count: Math.max(0, r.count + (on === r.me ? 0 : on ? 1 : -1)) } : r))
    : on
      ? [...list, { name, count: 1, me: true, url }]
      : list;
  const kept = next.filter((r) => r.count > 0);
  return kept.length ? kept : undefined;
}
