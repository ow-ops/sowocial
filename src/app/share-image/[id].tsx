import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { useStatus } from '@/api/statuses';
import { ActingAccount } from '@/auth/session';
import { Button } from '@/components/button';
import { ShareCard } from '@/components/share-card';
import { Hairline, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';
import { saveToLibrary } from '@/utils/save-media';
import { showError, showToast } from '@/utils/toast';

export default function ShareImageScreen() {
  const { id, account } = useLocalSearchParams<{ id: string; account?: string }>();
  return (
    <ActingAccount account={account}>
      <ShareImageContent id={id} />
    </ActingAccount>
  );
}

function ShareImageContent({ id }: { id: string }) {
  const { data: status } = useStatus(id);
  return status ? <ShareImage status={status} /> : null;
}

function ShareImage({ status }: { status: Post }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const card = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);

  const run = async (action: 'share' | 'save') => {
    setBusy(action);
    try {
      const uri = await captureRef(card, { format: 'png', result: 'tmpfile' });
      if (action === 'share') {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('status.shareImage.title') });
      } else {
        showToast((await saveToLibrary(uri)) ? t('timeline.media.saved') : t('timeline.media.saveDenied'));
      }
    } catch (error) {
      showError(t('status.shareImage.failed'), error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.page }]}>
      <Stack.Screen options={{ title: t('status.shareImage.title') }} />
      <ScrollView contentContainerStyle={styles.scroll} contentInsetAdjustmentBehavior="automatic">
        <ShareCard ref={card} status={status} />
      </ScrollView>
      <View style={[styles.actions, { borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.action}>
          <Button label={t('status.shareImage.save')} variant="outline" onPress={() => run('save')} loading={busy === 'save'} disabled={!!busy} />
        </View>
        <View style={styles.action}>
          <Button label={t('common.share')} onPress={() => run('share')} loading={busy === 'share'} disabled={!!busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: Hairline,
  },
  action: {
    flex: 1,
  },
});
