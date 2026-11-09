type Reply = { id: string; replyTo?: { id: string } };

// Mastodon-compatible servers return descendants in depth-first order.
export function withDepth<T extends Reply>(rootId: string, descendants: T[]) {
  const depths = new Map<string, number>([[rootId, -1]]);
  return descendants.map((status) => {
    const depth = (depths.get(status.replyTo?.id ?? '') ?? -1) + 1;
    depths.set(status.id, depth);
    return { status, depth };
  });
}
