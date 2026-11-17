import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';

import { Hairline, Radius, Spacing } from '@/constants/theme';
import { useScheme, useTheme } from '@/hooks/use-theme';

// Material 3's navigation bar is a fixed 80dp above the system inset. sonner-native counts its offset from the
// screen edge, so the toast clears both.
const ANDROID_TAB_BAR = 80;

export function AppToaster() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offset = Platform.OS === 'android' ? insets.bottom + ANDROID_TAB_BAR + Spacing.two : Spacing.six;
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
