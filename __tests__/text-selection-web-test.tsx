import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { StatusContent } from '@/components/status-content';
import { useDoubleTapLike } from '@/hooks/use-double-tap-like';
import type { RichContent } from '@/model/content';
import type { Post } from '@/model/post';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/use-open-account', () => ({ useOpenAccount: () => jest.fn() }));
jest.mock('@/hooks/use-open-url', () => ({ useOpenUrl: () => jest.fn() }));
const mockMutate = jest.fn();
jest.mock('@/api/statuses', () => ({ useStatusAction: () => ({ mutate: mockMutate }) }));
jest.mock('@/utils/haptics', () => ({ tapHaptic: jest.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const contents: [string, RichContent][] = [
  ['plain html', { kind: 'html', html: '<p>hello world</p>', emojis: [] }],
  ['rich html', { kind: 'html', html: '<p>hello <a href="https://example.com">link</a></p>', emojis: [] }],
  ['segments', { kind: 'segments', segments: [{ type: 'text', text: 'hello world' }] }],
];

// Every text node must be selectable: no ancestor may compute user-select: none.
function unselectable(root: HTMLElement) {
  const blocked: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let el = node.parentElement; el && el !== root.parentElement; el = el.parentElement) {
      if (getComputedStyle(el).userSelect === 'none') {
        blocked.push(node.textContent ?? '');
        break;
      }
    }
  }
  return blocked;
}

describe('post text on web', () => {
  it.each(contents)('can be selected (%s)', async (_, content) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<StatusContent content={content} />));
    expect(container.textContent).toContain('hello');
    expect(unselectable(container)).toEqual([]);
    await act(async () => root.unmount());
    container.remove();
  });
});

describe('post card clicks on web', () => {
  const post = { viewer: { liked: false } } as Post;
  const event = { nativeEvent: {} } as Parameters<ReturnType<typeof useDoubleTapLike>>[0];
  const onSingle = jest.fn();
  let press: () => void;
  let root: Root;

  function Card() {
    const handler = useDoubleTapLike(post, { current: null }, onSingle, jest.fn());
    press = () => handler(event);
    return <p>some post text</p>;
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    onSingle.mockClear();
    mockMutate.mockClear();
    root = createRoot(document.body.appendChild(document.createElement('div')));
    await act(async () => root.render(<Card />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    window.getSelection()?.removeAllRanges();
    jest.useRealTimers();
  });

  it('opens the post on a plain click', () => {
    press();
    jest.runAllTimers();
    expect(onSingle).toHaveBeenCalledTimes(1);
  });

  it('does not open the post when a drag selected text', () => {
    window.getSelection()!.selectAllChildren(document.querySelector('p')!);
    press();
    jest.runAllTimers();
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('neither opens nor likes the post on a double-click', () => {
    press();
    press();
    jest.runAllTimers();
    expect(onSingle).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
