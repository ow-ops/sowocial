import { format } from 'date-fns';
import { Image } from 'expo-image';
import type { ComponentRef, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useInstance } from '@/api/ap/instance';
import { capabilitiesFor } from '@/api/backend/capabilities';
import { useModeratedPost } from '@/api/bsky/moderation';
import { Avatar } from '@/components/avatar';
import { QuotedPost } from '@/components/quoted-post';
import { EmojiText, StatusContent } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Radius, Spacing } from '@/constants/theme';
import { usePostView } from '@/hooks/use-post-view';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale } from '@/i18n';
import { withoutQuoteLink } from '@/model/content';
import type { Media, Post } from '@/model/post';
import { fullHandle } from '@/utils/acct';

const AVATAR = 44;
const BLUR = 40;

export function ShareCard({ status: original, ref }: { status: Post; ref?: Ref<ComponentRef<typeof View>> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const status = useModeratedPost(original, 'contentView');
  const { quote } = usePostView(status);
  const domain = useInstance().data?.domain;
  const handle = fullHandle(status.author.handle, capabilitiesFor(status.protocol).serverInfo ? domain : undefined);
  const images = status.media.filter((m) => m.kind !== 'audio' && (m.previewUrl ?? m.url)).slice(0, 4);

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: theme.page, borderColor: theme.border }]}>
      <View style={styles.author}>
        <Avatar uri={status.author.avatar} size={AVATAR} />
        <View style={styles.authorText}>
          <EmojiText type="name" numberOfLines={1} text={status.author.displayName || status.author.handle} emojis={status.author.emojis} />
          <ThemedText type="meta" numberOfLines={1}>
            @{handle}
          </ThemedText>
        </View>
      </View>

      {!!status.contentWarning && <ThemedText themeColor="heading">{status.contentWarning}</ThemedText>}
      <StatusContent content={quote && status.quoteLink ? withoutQuoteLink(status.content, status.quoteLink) : status.content} mentions={status.mentions} tags={status.tags} size="large" />
      {images.length > 0 && <Images media={images} blurred={status.sensitive} />}
      {quote && <QuotedPost post={quote} />}

      <ThemedText type="meta">{format(new Date(status.createdAt), t('status.hero.dateFormat'), { locale: dateLocale() })}</ThemedText>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <ThemedText type="label" themeColor="primary">
          sowocial
        </ThemedText>
        <ThemedText type="meta" numberOfLines={1} style={styles.host}>
          {new URL(status.url).hostname}
        </ThemedText>
      </View>
    </View>
  );
}

function Images({ media, blurred }: { media: Media[]; blurred: boolean }) {
  const theme = useTheme();
  const single = media.length === 1;
  return (
    <View style={styles.images}>
      {media.map((m) => (
        <View
          key={m.id}
          style={[styles.image, { backgroundColor: theme.surface }, single ? { width: '100%', aspectRatio: Math.max(m.aspect ?? 16 / 9, 3 / 4) } : styles.tile]}>
          <Image
            source={m.previewUrl ?? m.url}
            placeholder={m.blurhash ? { blurhash: m.blurhash } : undefined}
            cachePolicy="memory-disk"
            contentFit="cover"
            blurRadius={blurred ? BLUR : 0}
            style={styles.fill}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: Hairline,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: Spacing.four,
    gap: Spacing.oneHalf,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.oneHalf,
    marginBottom: Spacing.one,
  },
  authorText: {
    flex: 1,
    minWidth: 0,
  },
  images: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  image: {
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  tile: {
    width: '49%',
    aspectRatio: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.two,
    paddingTop: Spacing.oneHalf,
    borderTopWidth: Hairline,
  },
  host: {
    flexShrink: 1,
  },
});
