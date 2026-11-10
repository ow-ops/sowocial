import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBskyMessages, useMarkBskyConvoRead, useSendBskyMessage } from '@/api/bsky/chat';
import { useAuthedSession } from '@/auth/session';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Radius, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/model/chat';
import { shortRelativeTime } from '@/utils/relative-time';

const MAX_LENGTH = 1000;

export default function ConversationScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const column = useColumn();
  const insets = useSafeAreaInsets();
  const { accountId } = useAuthedSession();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const query = useBskyMessages(id);
  const send = useSendBskyMessage(id);
  const { mutate: markRead } = useMarkBskyConvoRead(id);
  const [draft, setDraft] = useState('');
  const marked = useRef<string | null>(null);

  const messages = query.data?.pages.flat() ?? [];
  const newest = messages[0];

  useEffect(() => {
    if (!newest || marked.current === newest.id) return;
    marked.current = newest.id;
    markRead(newest.id);
  }, [newest, markRead]);

  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text, { onSuccess: () => setDraft('') });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, column.listStyle]}>
      <Stack.Screen options={{ title: title ?? t('common.nav.messages') }} />
      <FlashList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Bubble message={item} mine={item.senderDid === accountId} />}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[column.contentStyle, styles.list]}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.empty}>
            <QueryState
              pending={query.isPending}
              error={query.error}
              emptyText={t('chat.noMessages')}
              onRetry={() => void query.refetch()}
            />
          </View>
        }
        ListFooterComponent={query.isFetchingNextPage ? <QueryState pending error={null} /> : null}
      />
      <View
        style={[
          styles.composer,
          column.contentStyle,
          { backgroundColor: theme.page, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.two) },
        ]}>
        <View style={styles.inputRow}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.placeholder')}
            accessibilityLabel={t('chat.messageLabel')}
            maxLength={MAX_LENGTH}
            multiline
            style={styles.input}
          />
          <Button
            label={t('chat.send')}
            onPress={submit}
            disabled={!draft.trim()}
            loading={send.isPending}
            size="small"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const time = shortRelativeTime(message.sentAt);
  const text = message.deleted ? t('chat.deleted') : message.text;

  return (
    <View
      style={[styles.item, mine ? styles.mine : styles.theirs]}
      accessible
      accessibilityLabel={t(mine ? 'chat.sentByYou' : 'chat.sentByThem', { text, time })}>
      <View style={[styles.bubble, { backgroundColor: mine ? theme.primary : theme.surface }]}>
        <ThemedText
          selectable
          style={[{ color: mine ? theme.onPrimary : theme.text }, message.deleted && styles.deleted]}>
          {text}
        </ThemedText>
      </View>
      <ThemedText type="meta">{time}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  empty: {
    padding: Spacing.four,
  },
  item: {
    gap: Spacing.half,
    marginVertical: Spacing.one,
    maxWidth: '85%',
  },
  mine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  theirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  deleted: {
    fontStyle: 'italic',
  },
  composer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: Hairline,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    maxHeight: 120,
  },
});
