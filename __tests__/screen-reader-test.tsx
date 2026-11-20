import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useScreenReader } from '@/hooks/use-screen-reader';

describe('useScreenReader', () => {
  it('shares one system subscription between hooks and follows changes', async () => {
    let notify: (on: boolean) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    const listen = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_: string, handler: (on: boolean) => void) => {
      notify = handler;
      return { remove };
    }) as never);

    const first = await renderHook(() => useScreenReader());
    const second = await renderHook(() => useScreenReader());
    expect(listen).toHaveBeenCalledTimes(1);

    await act(async () => notify(true));
    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(true);

    await first.unmount();
    expect(remove).not.toHaveBeenCalled();
    await second.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
