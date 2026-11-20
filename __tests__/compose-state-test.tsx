import { act, renderHook } from '@testing-library/react-native';

import { useComposeState } from '@/components/compose-state';

jest.mock('masto', () => ({ createRestAPIClient: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showError: jest.fn() }));

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

  it('lists the form as the first post followed by the thread', async () => {
    const { result } = await renderHook(() => useComposeState({ ...initial, text: 'one', extras: [{ text: 'two', media: [] }] }));
    expect(result.current.segments.map((s) => s.text)).toEqual(['one', 'two']);
  });

  it('promotes the next post into the form when advancing a thread', async () => {
    const poll = { options: ['a', 'b'], expiresIn: 60, multiple: false, hideTotals: false };
    const { result } = await renderHook(() => useComposeState({ ...initial, text: 'one', poll, extras: [{ text: 'two', media: [] }, { text: 'three', media: [] }] }));
    await act(async () => result.current.advance(result.current.segments.slice(1), { inReplyToId: '1' }));
    expect(result.current.text).toBe('two');
    expect(result.current.selection).toEqual({ start: 3, end: 3 });
    expect(result.current.poll).toBeNull();
    expect(result.current.extras.map((e) => e.text)).toEqual(['three']);
    expect(result.current.chain).toEqual({ inReplyToId: '1' });
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
