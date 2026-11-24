import { format } from 'date-fns';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { classifyInstanceError, usePublicPost } from '@/api/ap/instance-browse';
import { useLinkedPost } from '@/api/statuses';
import NotFound from '@/app/+not-found';
import { accountKey, ActingAccount, useAccountScope, useSession } from '@/auth/session';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { ThreadView } from '@/components/thread-view';
import { ColumnWidth, Density, Radius, Spacing } from '@/constants/theme';
import { dateLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { contentToCopy } from '@/model/content';
import type { Post } from '@/model/post';
import { bareDomain } from '@/utils/acct';
import { originalUrl } from '@/utils/links';
import { openLink } from '@/utils/open-link';

// Signed in, the post is looked up through the user's server; signed out, the post's server is asked directly.
export default function SharedPost() {
  const { server, path } = useLocalSearchParams<{ server: string; path: string[] }>();
  const { session, sessions } = useSession();
  const domain = bareDomain(server);
  if (!domain || !path?.length) return <NotFound />;
  const url = originalUrl(domain, path);
  // A Bluesky account can't look up fediverse posts.
  const reader = session?.protocol === 'ap' ? session : sessions.find((s) => s.protocol === 'ap');
  if (!reader) return <VisitorPost domain={domain} id={path.at(-1)!} url={url} signedIn={!!session} />;
  return (
    <ActingAccount account={accountKey(reader)}>
      <MemberPost domain={domain} url={url} />
    </ActingAccount>
  );
}

function MemberPost({ domain, url }: { domain: string; url: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const post = useLinkedPost(url, useAccountScope(), '');

  if (post.data) {
    return (
      <>
        <Stack.Screen options={{ title: t('common.nav.post') }} />
        <ThreadView id={post.data.id} />
      </>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: t('common.nav.post') }} />
      <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.page}>
        <QueryState
          pending={post.isPending}
          error={post.isPending ? null : new Error(t('status.publicPost.notFound', { domain }))}
          pendingLabel={t('status.thread.loadingPost')}
          onRetry={post.refetch}
        />
        {!post.isPending && (
          <Button variant="outline" label={t('status.publicPost.openOriginal', { domain })} onPress={() => openLink(url)} />
        )}
      </ScrollView>
    </>
  );
}

function VisitorPost({ domain, id, url, signedIn }: { domain: string; id: string; url: string; signedIn: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const post = usePublicPost(domain, id);
  // The server's choice, not a failure: no retry, no error colour.
  const restricted = !!post.error && classifyInstanceError(post.error) === 'restricted';

  return (
    <>
      <Stack.Screen options={{ title: t('common.nav.post') }} />
      <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.page}>
        {post.data ? (
          <PostBody post={post.data} />
        ) : restricted ? (
          <ThemedText themeColor="muted" accessibilityRole="alert">
            {t('status.publicPost.unavailable', { domain })}
          </ThemedText>
        ) : (
          <QueryState
            pending={post.isPending}
            error={post.error && new Error(t('status.publicPost.loadFailed', { domain }))}
            pendingLabel={t('status.thread.loadingPost')}
            onRetry={post.refetch}
          />
        )}
        <View style={styles.actions}>
          <Button
            label={post.data ? t('status.publicPost.signIn') : t('status.publicPost.signInToRead')}
            onPress={() => router.push(signedIn ? '/add-account' : '/login')}
          />
          <Button variant="outline" label={t('status.publicPost.openOriginal', { domain })} onPress={() => openLink(url)} />
        </View>
      </ScrollView>
    </>
  );
}

function PostBody({ post }: { post: Post }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [revealed, setRevealed] = useState(!post.contentWarning);
  const images = post.sensitive ? [] : post.media.filter((m) => m.kind === 'image' && m.previewUrl);
  const hidden = post.media.length - images.length;

  return (
    <View style={styles.post}>
      <View style={styles.author}>
        <Avatar uri={post.author.avatar} size={40} />
        <View style={styles.authorText}>
          <EmojiText type="name" numberOfLines={1} text={post.author.displayName} emojis={post.author.emojis} />
          <ThemedText type="meta" numberOfLines={1}>
            @{post.author.handle}
          </ThemedText>
        </View>
      </View>
      {post.contentWarning && (
        <View style={styles.warning}>
          <ThemedText type="label">{post.contentWarning}</ThemedText>
          <Button
            size="small"
            variant="outline"
            label={revealed ? t('status.body.hide') : t('status.body.showPost')}
            onPress={() => setRevealed(!revealed)}
          />
        </View>
      )}
      {revealed && (
        <>
          <ThemedText type="lead">{contentToCopy(post.content)}</ThemedText>
          {images.map((m) => (
            <Image
              key={m.id}
              source={m.previewUrl}
              accessibilityLabel={m.alt || t('status.body.image')}
              contentFit="cover"
              style={[styles.image, { aspectRatio: m.aspect ?? 16 / 9, backgroundColor: theme.border }]}
            />
          ))}
          {hidden > 0 && <ThemedText type="meta">{t('status.publicPost.hiddenMedia', { count: hidden })}</ThemedText>}
        </>
      )}
      <ThemedText type="meta">{format(new Date(post.createdAt), t('status.hero.dateFormat'), { locale: dateLocale() })}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: ColumnWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.four,
  },
  post: {
    gap: Spacing.three,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  authorText: {
    flexShrink: 1,
  },
  warning: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  image: {
    width: '100%',
    maxHeight: Density.comfortable.mediaMaxHeight,
    borderRadius: Radius.md,
  },
  actions: {
    gap: Spacing.two,
  },
});
