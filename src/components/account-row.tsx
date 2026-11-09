import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Author } from '@/model/post';

export function AccountRow({ account, trailing }: { account: Author; trailing?: ReactNode }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.border : theme.page, borderBottomColor: theme.border },
      ]}>
      <Avatar uri={account.avatar} />
      <View style={styles.text}>
        <EmojiText type="name" text={account.displayName} emojis={account.emojis} />
        <ThemedText type="meta" numberOfLines={1}>
          @{account.handle}
        </ThemedText>
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: Hairline,
  },
  text: {
    flex: 1,
  },
});
