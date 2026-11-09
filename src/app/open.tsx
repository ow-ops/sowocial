import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useOpenUrl } from '@/hooks/use-open-url';
import { useTheme } from '@/hooks/use-theme';

export default function Open() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url?: string }>();
  const openUrl = useOpenUrl();

  useEffect(() => {
    if (!url) return;
    if (router.canGoBack()) router.back();
    else router.replace('/home');
    openUrl(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (!url) return <Redirect href="/home" />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.page }}>
      <ActivityIndicator color={theme.primary} accessibilityLabel={t('auth.open.opening')} />
    </View>
  );
}
