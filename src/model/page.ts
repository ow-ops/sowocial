export type Page<T, Next = string> = { items: T[]; next?: Next };

// An empty page ends the list even when the server hands back a cursor.
export const pageOf = <T>(items: T[], next: string | undefined): Page<T> => ({ items, next: items.length > 0 ? next : undefined });
