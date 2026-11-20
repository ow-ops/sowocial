import { act, renderHook } from '@testing-library/react-native';

import type { PostOutcome } from '@/api/backend/types';
import { useComposeSend } from '@/hooks/use-compose-send';
import { getPref } from '@/prefs/store';
import { confirmAction } from '@/utils/dialog';
import type { DraftSegment } from '@/utils/drafts';
import { showError, showToast } from '@/utils/toast';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockIsFocused = jest.fn(() => true);
const mockPost = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useNavigation: () => ({ isFocused: mockIsFocused }),
}));
jest.mock('@/api/statuses', () => ({ usePostStatus: () => ({ mutateAsync: mockPost, isPending: false, error: null }) }));
jest.mock('@/prefs/store', () => ({ getPref: jest.fn(() => false) }));
jest.mock('@/utils/dialog', () => ({ confirmAction: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showError: jest.fn(), showToast: jest.fn() }));

const segment = (text: string, description = 'alt'): DraftSegment => ({ text, media: [{ uri: `file://${text}`, description }] });
const created = (id: string): PostOutcome => ({ kind: 'created', id }) as PostOutcome;

const setup = async (segments: DraftSegment[]) => {
  const options = {
    owner: 'me',
    segments,
    chain: undefined,
    draftFor: jest.fn((s: DraftSegment, at) => ({ status: s.text, inReplyToId: at?.inReplyToId }) as never),
    advance: jest.fn(),
    focusAlt: jest.fn(),
    onSent: jest.fn(),
  };
  const { result } = await renderHook(() => useComposeSend(options));
  return { options, result };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFocused.mockReturnValue(true);
  jest.mocked(getPref).mockReturnValue(false as never);
});

describe('useComposeSend', () => {
  it('ignores a second submit while the first is still going out', async () => {
    let finish!: (outcome: PostOutcome) => void;
    mockPost.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result, options } = await setup([segment('one')]);

    await act(async () => {
      result.current.submit();
      result.current.submit();
    });
    expect(mockPost).toHaveBeenCalledTimes(1);

    await act(async () => finish(created('1')));
    expect(options.onSent).toHaveBeenCalledTimes(1);
  });

  it('can send again after a failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(created('1'));
    const { result, options } = await setup([segment('one')]);

    await act(async () => result.current.submit());
    expect(options.onSent).not.toHaveBeenCalled();
    await act(async () => result.current.submit());
    expect(options.onSent).toHaveBeenCalledTimes(1);
  });

  it('sends a thread in order, replying to the previous post and handing over the rest', async () => {
    mockPost.mockResolvedValueOnce(created('1')).mockResolvedValueOnce(created('2'));
    const { result, options } = await setup([segment('one'), segment('two')]);

    await act(async () => result.current.submit());

    expect(mockPost.mock.calls.map(([draft]) => [draft.status, draft.inReplyToId])).toEqual([
      ['one', undefined],
      ['two', '1'],
    ]);
    expect(options.advance).toHaveBeenCalledTimes(1);
    expect(options.advance).toHaveBeenCalledWith([options.segments[1]], { inReplyToId: '1' });
    expect(options.onSent).toHaveBeenCalledTimes(1);
  });

  it('stops at the post that failed and leaves it and the rest in the form', async () => {
    mockPost.mockResolvedValueOnce(created('1')).mockRejectedValueOnce(new Error('offline'));
    const { result, options } = await setup([segment('one'), segment('two'), segment('three')]);

    await act(async () => result.current.submit());

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(options.advance).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith('compose.thread.failed', 'offline');
    expect(options.onSent).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('closes the screen and links to the first post once everything is sent', async () => {
    mockPost.mockResolvedValue(created('1'));
    const { result } = await setup([segment('one')]);

    await act(async () => result.current.submit());

    expect(mockBack).toHaveBeenCalledTimes(1);
    const { onClick } = jest.mocked(showToast).mock.calls[0][1] as { onClick: () => void };
    onClick();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/post/[id]', params: { id: '1', account: 'me' } });
  });

  it('does not navigate back when the user already left while it was sending', async () => {
    mockPost.mockResolvedValue(created('1'));
    mockIsFocused.mockReturnValue(false);
    const { result, options } = await setup([segment('one')]);

    await act(async () => result.current.submit());

    expect(options.onSent).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalled();
  });

  it('asks before posting media without a description and focuses it when the user wants to add one', async () => {
    jest.mocked(getPref).mockReturnValue(true as never);
    const { result, options } = await setup([segment('one'), segment('two', '')]);

    await act(async () => result.current.submit());

    expect(mockPost).not.toHaveBeenCalled();
    const [, , , { onCancel }] = jest.mocked(confirmAction).mock.calls[0] as unknown as [string, string, () => void, { onCancel: () => void }];
    onCancel();
    expect(options.focusAlt).toHaveBeenCalledWith('file://two');
  });

  it('posts anyway when the user confirms the reminder', async () => {
    jest.mocked(getPref).mockReturnValue(true as never);
    mockPost.mockResolvedValue(created('1'));
    const { result } = await setup([segment('one', '')]);

    await act(async () => result.current.submit());
    const [, , proceed] = jest.mocked(confirmAction).mock.calls[0] as unknown as [string, string, () => void];
    await act(async () => proceed());

    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
