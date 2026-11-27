import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable } from 'react-native';

import { webTitle } from '@/utils/accessibility';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('webTitle', () => {
  it('gives a pressable a hover label in the browser', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Pressable ref={webTitle('Boost')} accessibilityRole="button" />));
    expect(container.querySelector('[role="button"]')?.getAttribute('title')).toBe('Boost');
    act(() => root.unmount());
    container.remove();
  });
});
