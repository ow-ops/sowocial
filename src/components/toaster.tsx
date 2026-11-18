import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';

import { Hairline, Radius, Spacing } from '@/constants/theme';
import { useScheme, useTheme } from '@/hooks/use-theme';

// The tab bar sits above the system inset: 49pt on iOS, 80dp for Material 3's navigation bar. sonner-native counts
// its offset from the screen edge, so the toast clears both.
const TAB_BAR = Platform.OS === 'ios' ? 49 : 80;

export function AppToaster() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offset = insets.bottom + TAB_BAR + Spacing.two;
  return (
    <Toaster
      theme={useScheme()}
      position="bottom-center"
      offset={offset}
      icons={{ info: null }}
      toastOptions={{
        style: {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: Hairline,
          borderRadius: Radius.md,
          paddingVertical: Spacing.oneHalf,
        },
        titleStyle: { color: theme.heading },
        descriptionStyle: { color: theme.text },
        actionButtonStyle: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: Spacing.two },
        actionButtonTextStyle: { color: theme.primary, fontWeight: '600' },
      }}
    />
  );
}
