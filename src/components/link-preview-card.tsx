import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { LinkPreview } from '@/api/link-preview';
import { useLinkPreview } from '@/api/search';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Spacing } from '@/constants/theme';
import { useOpenUrl } from '@/hooks/use-open-url';
import { useTheme } from '@/hooks/use-theme';
import type { Card } from '@/model/post';

export function LinkPreviewCard({ url, card }: { url: string; card?: Card }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const openUrl = useOpenUrl();
  const { data: fetched } = useLinkPreview(card ? undefined : url);
  const preview: LinkPreview | null | undefined = card
    ? {
        'og:title': card.title,
        'og:description': card.description,
        'og:site_name': card.provider,
        'og:image': card.image,
      }
    : fetched;
  const title = preview?.['og:title'];
  if (!preview || !title) return null;

  const image = preview['og:image'];
  const width = preview['og:image:width'];
  const height = preview['og:image:height'];
  const description = preview['og:description'];
  const site = preview['og:site_name'] ?? new URL(url).hostname;

  return (
    <Pressable
      onPress={() => openUrl(url)}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={t('status.linkPreview.opens', { site })}
      style={[styles.card, { borderColor: theme.border }]}>
      {image && (
        <Image
          source={image}
          recyclingKey={image}
          cachePolicy="memory-disk"
          accessibilityLabel={preview['og:image:alt']}
          contentFit="cover"
          style={[
            styles.image,
            { backgroundColor: theme.surface, aspectRatio: width && height ? Math.max(width / height, 1) : 16 / 9 },
          ]}
        />
      )}
      <View style={styles.text}>
        <ThemedText type="meta" numberOfLines={1}>
          {site}
        </ThemedText>
        <ThemedText type="label" themeColor="heading" numberOfLines={2}>
          {title}
        </ThemedText>
        {!!description && <ThemedText numberOfLines={3}>{description}</ThemedText>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...Outlined,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
  },
  text: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
