import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { getBackend } from '@/api/backend';
import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { NativeMenu } from '@/components/native-menu';
import { NetworkGlyph, networkColor, sessionHandle, useAccountSource } from '@/components/source-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';
import { showError } from '@/utils/toast';

export function ReplyAccount({ owner, parent, text }: { owner: string; parent?: Post; text: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { sessions } = useSession();
  const source = useAccountSource(true, owner);
  const [switching, setSwitching] = useState(false);
  if (!source) return null;

  const others =
    parent?.protocol === 'ap' ? sessions.filter((s) => s.protocol === 'ap' && accountKey(s) !== owner) : [];

  const switchTo = async (parent: Post, target: Session) => {
    const key = accountKey(target);
    setSwitching(true);
    try {
      const found = await getBackend(key).resolveUrl(parent.url);
      if (found?.type !== 'status') throw new Error(t('compose.replyAs.notFound'));
      router.replace({ pathname: '/compose', params: { replyTo: found.id, account: key, text } });
    } catch (error) {
      showError(t('compose.replyAs.failed'), error instanceof Error ? error.message : undefined);
      setSwitching(false);
    }
  };

  const label = t('auth.network.postingAs', { handle: source.handle, network: source.network });
  const line = (
    <>
      <NetworkGlyph protocol={source.protocol} />
      <ThemedText type="meta" themeColor={networkColor(source.protocol)}>
        {source.network}
      </ThemedText>
      <ThemedText type="meta" numberOfLines={1} style={styles.handle}>
        {source.handle}
      </ThemedText>
    </>
  );

  if (others.length === 0) {
    return (
      <View accessible accessibilityLabel={label} style={styles.row}>
        {line}
      </View>
    );
  }

  return (
    <NativeMenu
      label={t('compose.replyAs.title')}
      trigger="text"
      groups={[
        {
          key: 'own',
          items: others.map((s) => ({
            key: accountKey(s),
            title: sessionHandle(s),
            icon: 'person.crop.circle',
            onPress: () => void switchTo(parent!, s),
          })),
        },
      ]}
      renderTrigger={(open) => (
        <Pressable
          onPress={open}
          disabled={switching}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={styles.row}>
          {line}
          {switching ? (
            <ActivityIndicator size="small" color={theme.muted} />
          ) : (
            <ThemedText type="meta" themeColor="primary">
              {t('compose.replyAs.change')}
            </ThemedText>
          )}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: TouchTarget,
  },
  handle: {
    flexShrink: 1,
  },
});
