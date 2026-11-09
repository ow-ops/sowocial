import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  type Conversation,
  useConversations,
  useConversationStream,
  useDeleteConversation,
  useMarkConversationRead,
} from '@/api/ap/conversations';
import { useCapabilities } from '@/api/backend';
import { Avatar } from '@/components/avatar';
import { BskyConversations } from '@/components/bsky-conversations';
import { InfiniteList } from '@/components/infinite-list';
import { StatusContent } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Pill, Spacing } from '@/constants/theme';
import { useOpenStatus } from '@/hooks/use-open-status';
import { useTheme } from '@/hooks/use-theme';
import { contentToText } from '@/model/content';
import { confirmAction } from '@/utils/dialog';
import { shortRelativeTime } from '@/utils/relative-time';

export default function MessagesScreen() {
  return useCapabilities().chat ? <BskyConversations /> : <FediverseMessages />;
}

function FediverseMessages() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  useConversationStream();

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/compose', params: { visibility: 'direct' } })}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.conversations.newMessage')}>
              <SymbolView
                name={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }}
                size={22}
                tintColor={theme.primary}
              />
            </Pressable>
          ),
        }}
      />
      <InfiniteList
        title={t('common.nav.messages')}
        query={useConversations()}
        keyExtractor={(c) => c.id}
        renderItem={(c) => <ConversationRow conversation={c} />}
        emptyText={t('notifications.conversations.emptyText')}
      />
    </>
  );
}

function ConversationRow({ conversation: c }: { conversation: Conversation }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const open = useOpenStatus();
  const markRead = useMarkConversationRead();
  const remove = useDeleteConversation();
  const last = c.lastStatus;
  const deleteConversation = () =>
    confirmAction(t('notifications.conversations.deleteConfirm'), t('common.delete'), () => remove.mutate(c.id));
  // The server leaves the requester out; a conversation with yourself has no other participants.
  const names = c.accounts.map((a) => a.displayName).join(', ') || t('notifications.conversations.justYou');

  const label = [
    t(c.unread ? 'notifications.conversations.unreadWith' : 'notifications.conversations.with', { names }),
    last && shortRelativeTime(last.createdAt),
    last && (last.contentWarning ? t('a11y.contentWarning', { text: last.contentWarning }) : contentToText(last.content)),
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      disabled={!last}
      onPress={() => {
        if (c.unread) markRead.mutate(c.id);
        if (last) open(last, `/post/${last.id}`);
      }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.page, borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.surface },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[
        ...(c.unread ? [{ name: 'markRead', label: t('notifications.conversations.markRead') }] : []),
        { name: 'delete', label: t('common.delete') },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'markRead') markRead.mutate(c.id);
        else deleteConversation();
      }}>
      <View style={styles.avatar}>
        {c.accounts[0] && <Avatar uri={c.accounts[0].avatar} />}
        {c.unread && <View style={[styles.dot, { backgroundColor: theme.primary, borderColor: theme.page }]} />}
      </View>
      <View style={styles.body}>
        <View style={styles.header}>
          <ThemedText type="name" numberOfLines={1} style={styles.names}>
            {names}
          </ThemedText>
          {last && <ThemedText type="meta">{shortRelativeTime(last.createdAt)}</ThemedText>}
        </View>
        {last && (
          <View style={styles.excerpt}>
            <StatusContent content={last.content} mentions={last.mentions} muted={!c.unread} />
          </View>
        )}
        <View style={styles.actions}>
          {c.unread && (
            <Pressable hitSlop={ACTION_HIT_SLOP} accessible={false} onPress={() => markRead.mutate(c.id)}>
              <ThemedText type="label" themeColor="primary">
                {t('notifications.conversations.markRead')}
              </ThemedText>
            </Pressable>
          )}
          <Pressable hitSlop={ACTION_HIT_SLOP} accessible={false} onPress={deleteConversation}>
            <ThemedText type="label" themeColor="danger">
              {t('common.delete')}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const ACTION_HIT_SLOP = { top: 12, bottom: 12, left: Spacing.two, right: Spacing.two };

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
  excerpt: {
    maxHeight: 92,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});
