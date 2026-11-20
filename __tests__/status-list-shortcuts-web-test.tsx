import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { Post } from '@/model/post';
import { registerList } from '@/shortcuts/focus-store';
import { useStatusListShortcuts } from '@/shortcuts/use-status-list-shortcuts.web';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/hooks/use-open-status', () => ({ useOpenStatus: () => jest.fn() }));
jest.mock('@/shortcuts/column-focus.web', () => {
  const { createContext } = jest.requireActual('react');
  return { ColumnActiveContext: createContext(true) };
});
jest.mock('@/shortcuts/focus-store', () => ({ registerList: jest.fn(() => jest.fn()) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listRef = { current: null };

function List({ statuses }: { statuses: Post[] }) {
  useStatusListShortcuts(statuses, listRef, () => {});
  return null;
}

describe('status list shortcuts on web', () => {
  it('keeps one registration while the list re-renders with new posts', async () => {
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    const first = [{ key: 'a' }] as Post[];
    const second = [{ key: 'b' }, { key: 'a' }] as Post[];
    await act(async () => root.render(<List statuses={first} />));
    await act(async () => root.render(<List statuses={second} />));

    expect(registerList).toHaveBeenCalledTimes(1);
    const [list] = (registerList as jest.Mock).mock.calls[0];
    expect(list.statuses).toBe(second);
    await act(async () => root.unmount());
  });
});
