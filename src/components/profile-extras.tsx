import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ScrollView, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  useEndorsedAccounts,
  useFamiliarFollowers,
  useFeaturedTags,
  useFollowRequestCount,
} from '@/api/ap/profile-extras';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Pill, Press, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Author } from '@/model/post';

const openAccount = (id: string) => router.push({ pathname: '/account/[id]', params: { id } });

export function MovedBanner({ target }: { target: Author }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('profile.moved.a11y', { acct: target.handle })}
      onPress={() => openAccount(target.id)}
      style={({ pressed }) => [
        styles.moved,
        { backgroundColor: theme.surface, borderBottomColor: theme.border },
        pressed && { opacity: Press.opacity },
      ]}>
      <SymbolView
        name={{ ios: 'arrow.turn.up.right', android: 'arrow_forward', web: 'arrow_forward' }}
        size={18}
        tintColor={theme.primary}
      />
      <View style={styles.movedText}>
        <ThemedText type="meta">{t('profile.moved.title')}</ThemedText>
        <ThemedText themeColor="heading" numberOfLines={1}>
          @{target.handle}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function FollowRequestsButton() {
  const { t } = useTranslation();
  const count = useFollowRequestCount();
  if (!count) return null;
  return (
    <Button
      label={t('profile.followRequests.pending', { count })}
      accessibilityLabel={t('profile.followRequests.open', { count })}
      variant="outline"
      size="small"
      onPress={() => router.push('/follow-requests')}
    />
  );
}

export function FeaturedTags({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tags = useFeaturedTags(id, true).data;
  if (!tags?.length) return null;
  return (
    <View accessibilityRole="list" accessibilityLabel={t('profile.featuredTags.label')} style={styles.chips}>
      {tags.map((tag) => (
        <Pressable
          key={tag.id}
          accessibilityRole="link"
          accessibilityLabel={t('profile.featuredTags.open', { name: tag.name })}
          onPress={() => router.push({ pathname: '/tag/[name]', params: { name: tag.name } })}
          style={({ pressed }) => [styles.chip, { borderColor: theme.outline }, pressed && { opacity: Press.opacity }]}>
          <ThemedText type="meta" themeColor="heading">
            #{tag.name}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export function EndorsedAccounts({ id }: { id: string }) {
  const { t } = useTranslation();
  const accounts = useEndorsedAccounts(id, true).data;
  if (!accounts?.length) return null;
  return (
    <View style={styles.block}>
      <ThemedText type="meta" accessibilityRole="header">
        {t('profile.endorsed.title')}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {accounts.map((account) => (
          <Pressable
            key={account.id}
            accessibilityRole="link"
            accessibilityLabel={t('profile.endorsed.open', { acct: account.handle })}
            onPress={() => openAccount(account.id)}
            style={({ pressed }) => [styles.endorsed, pressed && { opacity: Press.opacity }]}>
            <Avatar uri={account.avatar} size={48} />
            <EmojiText type="meta" text={account.displayName} emojis={account.emojis} numberOfLines={1} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function FamiliarFollowers({ id }: { id: string }) {
  const { t } = useTranslation();
  const accounts = useFamiliarFollowers(id, true).data;
  if (!accounts?.length) return null;
  const [first, second] = accounts;
  const others = accounts.length - 2;
  const names = accounts.length === 1 ? first.displayName : accounts.length === 2 ? t('profile.familiar.two', { first: first.displayName, second: second.displayName }) : t('profile.familiar.more', { first: first.displayName, second: second.displayName, count: others });
  return (
    <View
      accessible
      accessibilityLabel={t('profile.familiar.a11y', { names })}
      style={styles.familiar}>
      <View style={styles.faces}>
        {accounts.slice(0, 3).map((account, i) => (
          <View key={account.id} style={i > 0 && styles.overlap}>
            <Avatar uri={account.avatar} size={24} />
          </View>
        ))}
      </View>
      <ThemedText type="meta" style={styles.familiarText}>
        {t('profile.familiar.followedBy', { names })}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  moved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: Hairline,
  },
  movedText: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  chip: {
    paddingHorizontal: Spacing.oneHalf,
    paddingVertical: Spacing.one,
    borderRadius: Pill,
    borderWidth: 1,
  },
  block: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  strip: {
    gap: Spacing.three,
  },
  endorsed: {
    width: 64,
    alignItems: 'center',
    gap: Spacing.one,
  },
  familiar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  faces: {
    flexDirection: 'row',
  },
  overlap: {
    marginLeft: -8,
  },
  familiarText: {
    flex: 1,
  },
});
