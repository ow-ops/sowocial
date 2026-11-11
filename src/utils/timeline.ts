import type { InfiniteData } from '@tanstack/react-query';

import type { Post } from '@/model/post';

export type TimelinePost = Post & { joined?: { above: boolean; below: boolean } };

export function joinedLines(p: Post) {
  const joined = (p as TimelinePost).joined;
  return { lineAbove: joined?.above ?? false, lineBelow: joined?.below ?? false };
}

export function replyHandle(p: Post) {
  const reply = p.replyTo;
  if (!reply) return undefined;
  if (reply.handle) return reply.handle;
  if (reply.authorId === p.author.id) return p.author.handle;
  return p.mentions?.find((m) => m.id === reply.authorId)?.handle;
}

const linkable = (p: Post) => !p.repostedBy && !p.gap;

function joinChains(page: Post[]): TimelinePost[] {
  const out: TimelinePost[] = [];
  let i = 0;
  while (i < page.length) {
    let end = i;
    while (
      end + 1 < page.length &&
      linkable(page[end]) &&
      linkable(page[end + 1]) &&
      page[end].protocol === page[end + 1].protocol &&
      page[end].replyTo?.id === page[end + 1].id
    ) {
      end++;
    }
    if (end === i) {
      out.push(page[i]);
    } else {
      // Keeps the saved read position from moving back.
      const cursor = page[i].cursor;
      const chain = page.slice(i, end + 1).reverse();
      chain.forEach((p, n) => out.push({ ...p, cursor, joined: { above: n > 0, below: n < chain.length - 1 } }));
    }
    i = end + 1;
  }
  return out;
}

export function arrangeTimeline<D extends InfiniteData<Post[], unknown>>(data: D): D & { pages: TimelinePost[][] } {
  const seen = new Set<string>();
  const pages = data.pages.map((page) =>
    joinChains(
      page.filter((p) => {
        const duplicate = !!p.repostedBy && !p.gap && seen.has(p.uid);
        seen.add(p.uid);
        return !duplicate;
      }),
    ),
  );
  return { ...data, pages };
}
