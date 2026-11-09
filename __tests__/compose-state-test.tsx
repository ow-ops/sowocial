import { act, renderHook } from '@testing-library/react-native';

import { useComposeState } from '@/components/compose-state';

jest.mock('masto', () => ({ createRestAPIClient: jest.fn() }));

const initial: Parameters<typeof useComposeState>[0] = { text: '', warning: '', showWarning: false, visibility: 'public', language: 'en', sensitive: false };

describe('useComposeState', () => {
  it('starts the caret after the prefilled text', async () => {
    const { result } = await renderHook(() => useComposeState({ ...initial, text: '@alice @bob ' }));
    expect(result.current.selection).toEqual({ start: 12, end: 12 });
  });

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

  it('follows late defaults until the user chooses', async () => {
    const { result, rerender } = await renderHook((props: typeof initial) => useComposeState(props), { initialProps: initial });
    await rerender({ ...initial, visibility: 'unlisted', language: 'de', sensitive: true });
    expect(result.current.visibility).toBe('unlisted');
    expect(result.current.language).toBe('de');
    expect(result.current.sensitive).toBe(true);
    await act(async () => result.current.setVisibility('private'));
    await rerender({ ...initial, visibility: 'direct', language: 'de', sensitive: true });
    expect(result.current.visibility).toBe('private');
  });
});
