import { contentToText } from '@/model/content';
import type { Post } from '@/model/post';

export const MAX_DEPTH = 3;

// Phanpy's collapse heuristic: a branch closes once its posts add up past MAX_WEIGHT.
const MAX_WEIGHT = 5;
const SHORT_WEIGHT = 2;
const WEIGHT_SEGMENT = 140;

export type ThreadRow =
  | { kind: 'missing'; key: string; lineAbove: boolean }
  | { kind: 'post'; key: string; status: Post; lineAbove: boolean; lineBelow: boolean }
  | { kind: 'hero'; key: string; status: Post; lineAbove: boolean }
  // rails[i]: the line at level i continues below this row.
  | { kind: 'reply'; key: string; status: Post; depth: number; rails: boolean[]; lineBelow: boolean; separator: boolean }
  | { kind: 'more'; key: string; parent: Post; depth: number; count: number; continues: boolean; rails: boolean[]; separator: boolean };

type Node = { status: Post; children: Node[] };

function weight(status: Post) {
  const text = contentToText(status.content).length + (status.contentWarning?.length ?? 0);
  const media = status.media.length > 0 ? WEIGHT_SEGMENT : 0;
  const poll = (status.poll?.options.length ?? 0) * 35;
  const card = status.card && !media && !poll ? 70 : 0;
  return (text + media + poll + card) / WEIGHT_SEGMENT;
}

const count = (nodes: Node[]): number => nodes.reduce((n, c) => n + 1 + count(c.children), 0);

export function buildThread(
  hero: Post,
  ancestors: Post[],
  descendants: Post[],
  expanded: ReadonlySet<string>,
  loaded: boolean,
): ThreadRow[] {
  const rows: ThreadRow[] = [];

  const chain = [...ancestors, hero];
  chain.forEach((status, i) => {
    const previous = chain[i - 1];
    const gap = loaded && !!status.replyTo && status.replyTo.id !== previous?.id;
    if (gap) rows.push({ kind: 'missing', key: `missing:${status.key}`, lineAbove: i > 0 });
    const lineAbove = i > 0 || gap;
    if (status === hero) rows.push({ kind: 'hero', key: status.key, status, lineAbove });
    else rows.push({ kind: 'post', key: status.key, status, lineAbove, lineBelow: true });
  });

  // The author's own replies continue in the hero's column instead of nesting.
  const selfThread = new Set<string>([hero.id]);
  const continuation: Post[] = [];
  for (const status of descendants) {
    if (status.author.id === hero.author.id && status.replyTo && selfThread.has(status.replyTo.id)) {
      selfThread.add(status.id);
      continuation.push(status);
    }
  }
  continuation.forEach((status, i) =>
    rows.push({ kind: 'post', key: status.key, status, lineAbove: i > 0, lineBelow: i < continuation.length - 1 }),
  );

  const nodes = new Map<string, Node>();
  const roots: Node[] = [];
  for (const status of descendants) {
    if (selfThread.has(status.id)) continue;
    const node: Node = { status, children: [] };
    nodes.set(status.id, node);
    const parent = status.replyTo && nodes.get(status.replyTo.id);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const replies: ThreadRow[] = [];
  const isOpen = (parent: Node, accumulated: number) => {
    if (expanded.has(parent.status.id)) return true;
    if (accumulated <= MAX_WEIGHT) return true;
    return count(parent.children) === 1 && weight(parent.children[0].status) < SHORT_WEIGHT;
  };

  const visit = (node: Node, depth: number, rails: boolean[], accumulated: number) => {
    const { children } = node;
    replies.push({
      kind: 'reply',
      key: node.status.key,
      status: node.status,
      depth,
      rails,
      lineBelow: children.length > 0,
      separator: false,
    });
    if (children.length === 0) return;

    const childDepth = depth + 1;
    const total = accumulated + children.reduce((w, c) => w + weight(c.status), 0);
    const continues = childDepth > MAX_DEPTH;
    if (continues || !isOpen(node, total)) {
      replies.push({
        kind: 'more',
        key: `more:${node.status.key}`,
        parent: node.status,
        depth: childDepth,
        count: count(children),
        continues,
        rails: [...rails, false],
        separator: false,
      });
      return;
    }
    children.forEach((child, i) => visit(child, childDepth, [...rails, i < children.length - 1], total));
  };
  for (const root of roots) visit(root, 0, [], weight(root.status));

  replies.forEach((row, i) => {
    const next = replies[i + 1];
    if ((row.kind === 'reply' || row.kind === 'more') && (!next || (next.kind === 'reply' && next.depth === 0))) {
      row.separator = true;
    }
  });

  return [...rows, ...replies];
}
