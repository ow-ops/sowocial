import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getBackend } from '@/api/backend';
import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { AccountSelect } from '@/components/account-select';
import { NetworkGlyph, networkColor, useAccountSource } from '@/components/source-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';
import { confirmAction } from '@/utils/dialog';
import { showError } from '@/utils/toast';

// A new post can move to any account; a reply only to Mastodon accounts that can resolve its parent.
export function ReplyAccount({
  owner,
  parent,
  text,
  isNew,
  leavesBehind,
  onLeave,
}: {
  owner: string;
  parent?: Post;
  text: string;
  isNew: boolean;
  // Only the text moves to the other account; anything else would be lost without a warning.
  leavesBehind: boolean;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { sessions } = useSession();
  const source = useAccountSource(true, owner);
  const [switching, setSwitching] = useState(false);
  if (!source) return null;

  const others = isNew
    ? sessions.filter((s) => accountKey(s) !== owner)
    : parent?.protocol === 'ap'
      ? sessions.filter((s) => s.protocol === 'ap' && accountKey(s) !== owner)
      : [];

  const switchTo = async (target: Session) => {
    const key = accountKey(target);
    if (!parent) {
      const go = () => {
        onLeave();
        router.replace({ pathname: '/compose', params: { account: key, text } });
      };
      if (leavesBehind) confirmAction(t('compose.replyAs.leavesBehind'), t('compose.replyAs.switch'), go);
      else go();
      return;
    }
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
  const current = sessions.find((s) => accountKey(s) === owner);

  return (
    <View style={styles.row}>
      <NetworkGlyph protocol={source.protocol} />
      <ThemedText type="meta" themeColor={networkColor(source.protocol)}>
        {source.network}
      </ThemedText>
      {switching ? (
        <ActivityIndicator size="small" color={theme.muted} />
      ) : current && others.length > 0 ? (
        <AccountSelect
          label={t(isNew ? 'compose.replyAs.postTitle' : 'compose.replyAs.title')}
          current={current}
          choices={[current, ...others]}
          onSelect={(s) => void switchTo(s)}
        />
      ) : (
        <ThemedText type="meta" numberOfLines={1} accessibilityLabel={label} style={styles.handle}>
          {source.handle}
        </ThemedText>
      )}
    </View>
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
