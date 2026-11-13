import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { classifyInstanceError, useInstanceTimeline } from '@/api/ap/instance-browse';
import { Avatar } from '@/components/avatar';
import { ErrorView } from '@/components/error-view';
import { InfiniteList } from '@/components/infinite-list';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Spacing } from '@/constants/theme';
import { useOpenUrl } from '@/hooks/use-open-url';
import { useTheme } from '@/hooks/use-theme';
import { contentToText } from '@/model/content';
import type { Post } from '@/model/post';

export default function InstanceTimeline() {
  const { t } = useTranslation();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const query = useInstanceTimeline(domain);

  if (query.isError) {
    const failure = classifyInstanceError(query.error);
    const message = failure === 'other' ? query.error.message : t(`timeline.instance.${failure}`, { domain });
    return (
      <>
        <Stack.Screen options={{ title: domain }} />
        <ErrorView error={new Error(message)} retry={query.refetch} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: domain }} />
      <InfiniteList
        query={query}
        renderItem={(post) => <RemotePost post={post} />}
        keyExtractor={(post) => post.key}
        emptyText={t('timeline.instance.empty', { domain })}
      />
    </>
  );
}

// Read-only: ids belong to the remote server, so a tap opens the post's URL through the user's own server.
function RemotePost({ post }: { post: Post }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const openUrl = useOpenUrl();
  const markers = [
    post.media.length > 0 && t('a11y.attachments', { count: post.media.length }),
    post.poll && t('a11y.poll'),
  ].filter(Boolean);
  const body = post.contentWarning ?? contentToText(post.content);
  const label = [
    post.author.displayName,
    post.contentWarning ? t('a11y.contentWarning', { text: body }) : body,
    ...markers,
  ].join('. ');
  return (
    <Pressable
      onPress={() => void openUrl(post.url, true)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('status.card.opensPost')}
      style={[styles.post, { borderColor: theme.border }]}>
      <View style={styles.author}>
        <Avatar uri={post.author.avatar} size={20} />
        <ThemedText type="name" numberOfLines={1} style={styles.name}>
          {post.author.displayName}
        </ThemedText>
        <ThemedText type="meta" numberOfLines={1} style={styles.handle}>
          @{post.author.handle}
        </ThemedText>
      </View>
      {post.contentWarning && <ThemedText type="label">{t('compose.options.contentWarning')}</ThemedText>}
      <ThemedText numberOfLines={4}>{body}</ThemedText>
      {markers.length > 0 && <ThemedText type="meta">{markers.join(' · ')}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  post: {
    ...Outlined,
    margin: Spacing.two,
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
});
