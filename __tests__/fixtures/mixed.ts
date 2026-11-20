import type { Post, Protocol } from '@/model/post';
import type { Fetchers, MixedPage, MixedParam } from '@/api/mixed';
import { loadMixedPage } from '@/api/mixed';

export function makePost(protocol: Protocol, id: string, at: number): Post {
  const uid = `${protocol}:${id}`;
  return { uid, key: uid, cursor: uid, id, protocol, url: `https://example.test/${uid}`, sortAt: new Date(at).toISOString(), author: { id: uid } } as unknown as Post;
}

export function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function stream(protocol: Protocol, times: number[]) {
  const posts = [...times].sort((a, b) => b - a).map((t, i) => makePost(protocol, `${i}`, t));
  const fetchPage = (cursor: string | undefined, size = 20) => {
    const start = cursor ? posts.findIndex((p) => p.cursor === cursor) + 1 : 0;
    const items = posts.slice(start, start + size);
    return { items, next: items.at(-1)?.cursor };
  };
  return { posts, fetchPage };
}

export type Run = { pages: MixedPage[]; params: (MixedParam | undefined)[] };

export async function drain(fetchers: Fetchers, maxPages = 200): Promise<Run> {
  const pages: MixedPage[] = [];
  const params: (MixedParam | undefined)[] = [];
  let param: MixedParam | undefined;
  for (let i = 0; i < maxPages; i++) {
    params.push(param);
    const page = await loadMixedPage(param, fetchers);
    pages.push(page);
    if (!page.next) return { pages, params };
    param = page.next;
  }
  throw new Error('did not terminate');
}
