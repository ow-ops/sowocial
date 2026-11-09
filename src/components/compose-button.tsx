import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function ComposeButton() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => router.push('/compose')}
      hitSlop={12}
      accessibilityLabel={t('timeline.compose.newPost')}
      accessibilityRole="button">
      <SymbolView
        name={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }}
        size={22}
        tintColor={theme.primary}
      />
    </Pressable>
  );
}
