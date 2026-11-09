import { act, renderHook } from '@testing-library/react-native';

import { useComposeState } from '@/components/compose-state';

jest.mock('masto', () => ({ createRestAPIClient: jest.fn() }));

const initial = { text: '', warning: '', showWarning: false, visibility: 'public' as const };

describe('useComposeState', () => {
  it('inserts an emoji at the caret with spacing', async () => {
    const { result } = await renderHook(() => useComposeState({ ...initial, text: 'hi' }));
    await act(async () => result.current.setSelection({ start: 2, end: 2 }));
    await act(async () => result.current.insertEmoji('smile'));
    expect(result.current.text).toBe('hi :smile: ');
    expect(result.current.selection).toEqual({ start: 11, end: 11 });
  });

  it('removes and patches attachments by uri', async () => {
    const { result } = await renderHook(() => useComposeState(initial));
    await act(async () => result.current.updateMedia('a', { description: 'x' }));
    expect(result.current.media).toEqual([]);
    await act(async () => result.current.setVisibility('private'));
    expect(result.current.visibility).toBe('private');
  });
});
