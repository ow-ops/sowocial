import { Image } from 'expo-image';
import { useRecyclingState } from '@shopify/flash-list';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTranslatedPost } from '@/api/ap/translate';
import { Badge } from '@/components/badge';
import { LinkPreviewCard } from '@/components/link-preview-card';
import { QuotedPost } from '@/components/quoted-post';
import { ReactionBar } from '@/components/status-reactions';
import { StatusContent } from '@/components/status-content';
import { StatusPoll } from '@/components/status-poll';
import { ThemedText } from '@/components/themed-text';
import { TranslateLine } from '@/components/translate-line';
import { Outlined, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useOpenStatus } from '@/hooks/use-open-status';
import type { PostView } from '@/hooks/use-post-view';
import { useTheme } from '@/hooks/use-theme';
import { firstContentLink } from '@/model/content';
import type { Media, Post } from '@/model/post';
import { notify } from '@/utils/dialog';

type BodyProps = {
  status: Post;
  view: PostView;
  size?: 'regular' | 'large';
  // Caps a single image's height; the hero shows it whole.
  mediaMaxHeight?: number;
};

export function StatusBody({ status: original, view, size = 'regular', mediaMaxHeight }: BodyProps) {
  const status = useTranslatedPost(original);
  const { t } = useTranslation();
  const theme = useTheme();
  const open = useOpenStatus();
  const { quote, resolving, revealed, setRevealed, sensitiveShown } = view;
  const hasWarning = !!status.contentWarning;
  const card = status.capabilities.embeddedCard ? status.card : undefined;
  // A linked post shows as a quote, so the link preview waits until the link turns out not to be one.
  const link = status.media.length === 0 && !card && !quote && !resolving ? firstContentLink(status.content) : undefined;

  const notes = [...(status.labels ?? []), ...(status.viewer.replyDisabled ? [t('status.repliesLimited')] : [])];

  return (
    <>
      {notes.length > 0 && (
        <View style={styles.notes}>
          {notes.map((note) => (
            <Badge key={note}>{note}</Badge>
          ))}
        </View>
      )}
      {hasWarning && (
        // Only the button toggles, so a tap on the warning opens the post.
        <View style={[styles.warning, { borderColor: theme.border }]}>
          <ThemedText>{status.contentWarning}</ThemedText>
          <Pressable
            onPress={() => setRevealed(!revealed)}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.contentWarning', { text: status.contentWarning })}
            accessibilityHint={revealed ? t('status.body.hidesPost') : t('status.body.showsPost')}
            accessibilityState={{ expanded: revealed }}
            hitSlop={Spacing.two}
            style={styles.warningToggle}>
            <ThemedText type="label" themeColor="primary">
              {revealed ? t('status.body.hide') : t('status.body.showPost')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {(!hasWarning || revealed) && (
        <>
          <StatusContent
            content={status.content}
            mentions={status.mentions}
            tags={status.tags}
            size={size}
            selectable={size === 'large'}
          />
          <TranslateLine status={original} />
          <MediaGrid
            maxHeight={mediaMaxHeight}
            media={status.media}
            sensitive={status.sensitive && !sensitiveShown}
            onOpen={(index) => open(status, `/media/${status.id}?index=${index}`)}
          />
          {status.poll && <StatusPoll status={status} poll={status.poll} />}
          <ReactionBar status={status} />
          {link && !status.poll && <LinkPreviewCard url={link} />}
          {card && <LinkPreviewCard url={card.url} card={card} />}
          {quote && <QuotedPost post={quote} />}
        </>
      )}
    </>
  );
}

function MediaGrid({
  media,
  sensitive,
  maxHeight,
  onOpen,
}: {
  media: Media[];
  maxHeight?: number;
  sensitive: boolean;
  onOpen: (index: number) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [hidden, setHidden] = useRecyclingState(sensitive, [sensitive, media.map((m) => m.id).join()]);
  if (media.length === 0) return null;

  return (
    <View style={styles.media}>
      {media.slice(0, 4).map((m, index) => (
        <View key={m.id} style={[styles.mediaItem, media.length === 1 && styles.mediaSingle, media.length === 1 && maxHeight !== undefined && { maxHeight }]}>
          <Pressable
            onPress={() => (hidden ? setHidden(false) : onOpen(index))}
            accessibilityRole={hidden ? 'button' : 'imagebutton'}
            accessibilityLabel={hidden ? t('status.body.sensitiveMedia') : (m.alt || (m.kind in BADGE_LABELS ? t(BADGE_LABELS[m.kind as keyof typeof BADGE_LABELS]) : t('status.body.image')))}
            accessibilityHint={hidden ? t('status.body.showsMedia') : t('status.body.opensMedia')}
            style={styles.mediaPress}>
            <Image
              source={m.previewUrl ?? m.url}
              recyclingKey={m.id}
              placeholder={m.blurhash ? { blurhash: m.blurhash } : undefined}
              cachePolicy="memory-disk"
              contentFit="cover"
              contentPosition={focusPosition(m.focus)}
              blurRadius={hidden ? 40 : 0}
              style={[styles.mediaImage, { backgroundColor: theme.surface }]}
            />
            {!hidden && m.kind !== 'image' && <MediaBadge type={m.kind} />}
            {hidden && (
              <View style={styles.sensitiveLabel}>
                <ThemedText type="meta" themeColor="heading">
                  {t('status.body.sensitiveTap')}
                </ThemedText>
              </View>
            )}
          </Pressable>
          {/* A sibling of the image button: a screen reader cannot reach a control nested inside it. */}
          {!hidden && !!m.alt && (
            <Pressable
              onPress={() => notify(t('status.body.description'), m.alt!)}
              accessibilityRole="button"
              accessibilityLabel={t('status.body.showDescription')}
              style={styles.alt}>
              <Badge variant="scrim">{t('status.body.alt')}</Badge>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

function focusPosition(focus?: { x: number; y: number } | null) {
  if (!focus) return undefined;
  const pct = (n: number) => `${Math.round(((Math.max(-1, Math.min(1, n)) + 1) / 2) * 100)}%` as const;
  return { left: pct(focus.x), top: pct(-focus.y) };
}

const BADGES = {
  video: 'status.body.badgeVideo',
  gifv: 'status.body.gif',
  audio: 'status.body.badgeAudio',
} as const;

const BADGE_LABELS = {
  video: 'status.body.video',
  gifv: 'status.body.gif',
  audio: 'status.body.audio',
} as const;

function MediaBadge({ type }: { type: Media['kind'] }) {
  const { t } = useTranslation();
  const key = BADGES[type as keyof typeof BADGES];
  if (!key) return null;
  const label = t(key);
  return (
    <Badge variant="scrim" style={styles.badge}>
      {label}
    </Badge>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
  },
  alt: {
    position: 'absolute',
    right: -Spacing.one,
    bottom: -Spacing.one,
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warning: {
    minHeight: TouchTarget,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    ...Outlined,
    gap: Spacing.one,
  },
  warningToggle: {
    alignSelf: 'flex-start',
  },
  notes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  media: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  mediaItem: {
    width: '49%',
    aspectRatio: 1,
  },
  mediaPress: {
    flex: 1,
  },
  mediaSingle: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mediaImage: {
    flex: 1,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  sensitiveLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
