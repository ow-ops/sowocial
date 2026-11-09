import type { CSSProperties } from 'react';
import { Toaster } from 'sonner';

import { Radius } from '@/constants/theme';
import { useScheme, useTheme } from '@/hooks/use-theme';

export function AppToaster() {
  const theme = useTheme();
  const style = {
    '--normal-bg': theme.surface,
    '--normal-text': theme.heading,
    '--normal-border': theme.border,
    '--border-radius': `${Radius.md}px`,
  } as CSSProperties;
  return <Toaster theme={useScheme()} position="bottom-center" style={style} />;
}
