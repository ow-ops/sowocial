import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useModeratedPost } from '@/api/bsky/moderation';
import { Avatar } from '@/components/avatar';
import { StatusContent } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Radius, Spacing } from '@/constants/theme';
import { useOpenStatus } from '@/hooks/use-open-status';
import { useTheme } from '@/hooks/use-theme';
import { contentToText } from '@/model/content';
import type { Post } from '@/model/post';

export function QuotedPost({ post: original }: { post: Post }) {
  const { t } = useTranslation();
  const post = useModeratedPost(original);
  const theme = useTheme();
  const open = useOpenStatus();
  const image = post.media[0];
  return (
    <Pressable
      onPress={() => open(post, `/post/${post.id}`)}
      accessibilityRole="button"
      accessibilityLabel={t('status.quote.a11y', { name: post.author.displayName, text: contentToText(post.content) })}
      accessibilityHint={t('status.card.opensPost')}
      style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.author}>
        <Avatar uri={post.author.avatar} size={20} />
        <ThemedText type="name" numberOfLines={1} style={styles.name}>
          {post.author.displayName}
        </ThemedText>
        <ThemedText type="meta" numberOfLines={1} style={styles.handle}>
          @{post.author.handle}
        </ThemedText>
      </View>
      <StatusContent content={post.content} />
      {image && !post.sensitive && (
        <Image
          source={image.previewUrl ?? image.url}
          recyclingKey={image.id}
          placeholder={image.blurhash ? { blurhash: image.blurhash } : undefined}
          cachePolicy="memory-disk"
          accessibilityLabel={image.alt}
          contentFit="cover"
          style={[styles.image, { backgroundColor: theme.surface }]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...Outlined,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    flexShrink: 1,
  },
  handle: {
    flexShrink: 1,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
  },
});
