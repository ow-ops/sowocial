import { Toaster } from 'sonner-native';

import { Hairline, Radius, Spacing } from '@/constants/theme';
import { useScheme, useTheme } from '@/hooks/use-theme';

export function AppToaster() {
  const theme = useTheme();
  return (
    <Toaster
      theme={useScheme()}
      position="bottom-center"
      offset={Spacing.six}
      toastOptions={{
        style: {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: Hairline,
          borderRadius: Radius.md,
        },
        titleStyle: { color: theme.heading },
        descriptionStyle: { color: theme.text },
      }}
    />
  );
}
