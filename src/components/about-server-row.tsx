import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useInstance } from '@/api/ap/instance';
import { Row } from '@/components/settings';

export function AboutServerRow() {
  const { t } = useTranslation();
  const { data } = useInstance();
  const name = data?.title ?? t('profile.aboutServer.fallbackName');
  return <Row title={t('profile.aboutServer.title', { name })} chevron onPress={() => router.push('/settings/server')} />;
}
