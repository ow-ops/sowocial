import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useBskyConvos } from '@/api/bsky/chat';
import { keys } from '@/api/keys';
import { useAccountScope } from '@/auth/session';
import { Avatar } from '@/components/avatar';
import { InfiniteList } from '@/components/infinite-list';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Pill, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChatConvo } from '@/model/chat';
import { shortRelativeTime } from '@/utils/relative-time';

export function BskyConversations() {
  const { t } = useTranslation();
  const account = useAccountScope();
  return (
    <InfiniteList
      title={t('common.nav.messages')}
      query={useBskyConvos()}
      queryKey={keys.bskyConvos(account)}
      keyExtractor={(c) => c.id}
      renderItem={(c) => <ConvoRow convo={c} />}
      emptyText={t('chat.empty')}
    />
  );
}

function preview(convo: ChatConvo, t: TFunction) {
  const last = convo.lastMessage;
  if (!last) return t('chat.noMessages');
  return last.deleted ? t('chat.deleted') : last.text;
}

function ConvoRow({ convo }: { convo: ChatConvo }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const unread = convo.unread > 0;
  const last = convo.lastMessage;
  const text = preview(convo, t);

  const label = [
    t(unread ? 'chat.unreadWith' : 'chat.with', { names: convo.title }),
    last && shortRelativeTime(last.sentAt),
    text,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/messages/[id]', params: { id: convo.id, title: convo.title } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.page, borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.surface },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <View style={styles.avatar}>
        {convo.members[0]?.avatar ? <Avatar uri={convo.members[0].avatar} /> : <View style={[styles.avatar, { backgroundColor: theme.surface, borderRadius: Pill }]} />}
        {unread && <View style={[styles.dot, { backgroundColor: theme.primary, borderColor: theme.page }]} />}
      </View>
      <View style={styles.body}>
        <View style={styles.header}>
          <ThemedText type="name" numberOfLines={1} style={styles.names}>
            {convo.title}
          </ThemedText>
          {last && <ThemedText type="meta">{shortRelativeTime(last.sentAt)}</ThemedText>}
        </View>
        <ThemedText numberOfLines={2} themeColor={unread ? 'heading' : 'muted'}>
          {text}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderBottomWidth: Hairline,
  },
  avatar: {
    width: 50,
    height: 50,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: Pill,
    borderWidth: 2,
  },
  body: {
    flex: 1,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  names: {
    flex: 1,
  },
});
