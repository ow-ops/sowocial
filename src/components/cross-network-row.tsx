import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { pickAccount } from '@/api/home-sources';
import { findAccount } from '@/api/cross-network';
import { accountKey, useSession } from '@/auth/session';
import { ThemedText } from '@/components/themed-text';
import { Press, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Author } from '@/model/post';
import { crossNetworkIdentity, identityUrl } from '@/utils/cross-network';
import { openLink } from '@/utils/open-link';

export function CrossNetworkRow({ account }: { account: Author }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session, sessions } = useSession();
  const identity = crossNetworkIdentity(account);
  if (!identity) return null;
  const signedIn = pickAccount(sessions, session, identity.protocol);

  const open = async () => {
    const found = signedIn ? await findAccount(signedIn, identity.handle).catch(() => null) : null;
    if (signedIn && found) return router.push({ pathname: '/account/[id]', params: { id: found.id, account: accountKey(signedIn) } });
    openLink(identityUrl(identity));
  };

  return (
    <Pressable
      accessibilityRole="link"
      onPress={open}
      style={({ pressed }) => [styles.row, pressed && { opacity: Press.opacity }]}>
      <SymbolView
        name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
        size={18}
        tintColor={theme.primary}
      />
      <View style={styles.text}>
        <ThemedText type="meta">
          {identity.protocol === 'bsky' ? t('profile.crossNetwork.bluesky') : t('profile.crossNetwork.fediverse')}
        </ThemedText>
        <ThemedText themeColor="heading" numberOfLines={1}>
          @{identity.handle}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  text: {
    flex: 1,
  },
});
