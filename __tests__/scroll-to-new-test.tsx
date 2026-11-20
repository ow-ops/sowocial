import { act, renderHook } from '@testing-library/react-native';

import { useScrollToNew } from '@/hooks/use-scroll-to-new';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

const listRef = { current: null };

describe('useScrollToNew', () => {
  it('keeps the list position when there was nothing to show', async () => {
    const { result } = await renderHook(() => useScrollToNew(listRef, 'a', () => false));
    await act(async () => result.current.showNew());
    expect(result.current.keepPosition).toBe(true);
  });

  it('releases the position only after the new posts arrive', async () => {
    const { result } = await renderHook(() => useScrollToNew(listRef, 'a', () => true));
    await act(async () => result.current.showNew());
    expect(result.current.keepPosition).toBe(false);
  });
});
