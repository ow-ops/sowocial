import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Post } from '@/model/post';

export function EditedMarker({ status }: { status: Post }) {
  const { t } = useTranslation();
  const router = useRouter();
  if (!status.editedAt) return null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/status-history/[id]', params: { id: status.id } })}
      hitSlop={{ top: 15, bottom: 15, left: Spacing.one, right: Spacing.one }}
      accessibilityRole="button"
      accessibilityLabel={t('status.edited.label')}
      accessibilityHint={t('status.edited.hint')}>
      <ThemedText type="meta">{t('status.edited.marker')}</ThemedText>
    </Pressable>
  );
}
