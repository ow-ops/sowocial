import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useComposeDraft } from '@/hooks/use-compose-draft';
import { deleteDraft, saveDraft, type SavedDraft } from '@/utils/drafts';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('@/utils/drafts', () => ({ saveDraft: jest.fn(), deleteDraft: jest.fn() }));

const draft = (text: string): SavedDraft => ({
  id: 'auto',
  updatedAt: 0,
  segments: [{ text, media: [] }],
  warning: '',
  showWarning: false,
});

let appStateChange: (state: string) => void;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    appStateChange = listener as (state: string) => void;
    return { remove: jest.fn() };
  });
});

afterEach(() => jest.useRealTimers());

const render = (initial: SavedDraft | null) =>
  renderHook((props: { draft: SavedDraft | null }) => useComposeDraft('me', props.draft, 'base'), { initialProps: { draft: initial } });

describe('useComposeDraft', () => {
  it('saves once typing pauses, with the newest text', async () => {
    const { rerender } = await render(draft('a'));
    await rerender({ draft: draft('ab') });
    await jest.advanceTimersByTimeAsync(400);
    expect(saveDraft).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(200);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith('me', draft('ab'), 'base');
  });

  it('does not save again when nothing changed since the last save', async () => {
    const { rerender } = await render(draft('a'));
    await jest.advanceTimersByTimeAsync(600);
    await rerender({ draft: draft('a') });
    await jest.advanceTimersByTimeAsync(600);
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('saves immediately when the screen loses focus', async () => {
    const { unmount } = await render(draft('a'));
    await unmount();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(600);
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('saves immediately when the app goes to the background, but not when it becomes active', async () => {
    await render(draft('a'));
    appStateChange('active');
    expect(saveDraft).not.toHaveBeenCalled();
    appStateChange('background');
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('saves nothing without a draft', async () => {
    const { unmount } = await render(null);
    await jest.advanceTimersByTimeAsync(600);
    await unmount();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('deletes the draft on discard and never writes it back', async () => {
    const { result, unmount } = await render(draft('a'));
    result.current();
    expect(deleteDraft).toHaveBeenCalledWith('me', 'auto');
    await jest.advanceTimersByTimeAsync(600);
    await unmount();
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
