import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getBackend } from '@/api/backend';
import { useModeratedPost } from '@/api/bsky/moderation';
import { keys } from '@/api/keys';
import { useAccountScope } from '@/auth/session';
import { Avatar } from '@/components/avatar';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useOpenStatus } from '@/hooks/use-open-status';
import { contentToText } from '@/model/content';
import type { Post } from '@/model/post';

function useParent(status: Post, known?: Post) {
  const reply = status.replyTo;
  const scope = useAccountScope();
  const account = status.accountKey ?? scope;
  return useQuery({
    queryKey: keys.status(account, reply?.id ?? ''),
    queryFn: () => getBackend(account).getPost(reply!.id),
    enabled: !!reply && !reply.post && !known,
    initialData: known ?? reply?.post,
    staleTime: 60 * 60 * 1000,
    retry: false,
  }).data;
}

export function ReplyParent({ status, parent: known, fallback }: { status: Post; parent?: Post; fallback?: string }) {
  const parent = useParent(status, known);
  return parent && !(parent.filters ?? []).length ? <ParentLine parent={parent} /> : <ReplyingTo handle={fallback} />;
}

function ReplyingTo({ handle }: { handle?: string }) {
  const { t } = useTranslation();
  return handle ? (
    <ThemedText type="meta" numberOfLines={1}>
      {t('status.card.replyingTo', { acct: handle })}
    </ThemedText>
  ) : null;
}

function ParentLine({ parent: original }: { parent: Post }) {
  const { t } = useTranslation();
  const open = useOpenStatus();
  const parent = useModeratedPost(original);

  const text = parent.contentWarning || contentToText(parent.content);
  return (
    <Pressable
      onPress={() => open(parent, `/post/${parent.id}`)}
      accessibilityRole="button"
      accessibilityLabel={t('status.card.replyingToPost', { acct: parent.author.handle, text })}
      style={styles.row}>
      <Avatar uri={parent.author.avatar} size={16} />
      <ThemedText type="meta" numberOfLines={1} style={styles.text}>
        <EmojiText type="meta" themeColor="heading" text={parent.author.displayName} emojis={parent.author.emojis} />{' '}
        {text}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  text: {
    flexShrink: 1,
  },
});
