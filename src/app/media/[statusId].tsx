import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { TFunction } from 'i18next';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { fitContainer, Gallery, type GalleryRefType, type VerticalPullOptions } from 'react-native-zoom-toolkit';

import { useStatus } from '@/api/statuses';
import { ActingAccount } from '@/auth/session';
import { ThemedText } from '@/components/themed-text';
import { Overlay, Press, Spacing } from '@/constants/theme';
import type { Media } from '@/model/post';
import { useMediaAutoplay } from '@/prefs/use-autoplay';
import { canSaveMedia, saveMedia } from '@/utils/save-media';
import { showError, showToast } from '@/utils/toast';

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1000;

export default function MediaViewer() {
  const { statusId, index = '0', account } = useLocalSearchParams<{ statusId: string; index?: string; account?: string }>();
  return (
    <ActingAccount account={account}>
      <MediaViewerContent statusId={statusId} index={index} />
    </ActingAccount>
  );
}

function MediaViewerContent({ statusId, index }: { statusId: string; index: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: status } = useStatus(statusId);
  const [current, setCurrent] = useState(Number(index));
  const [chromeVisible, setChromeVisible] = useState(true);
  const [screenReader, setScreenReader] = useState(false);
  const gallery = useRef<GalleryRefType>(null);
  const [saving, setSaving] = useState(false);
  const pull = useSharedValue(0);
  const { height } = useWindowDimensions();

  // Tapping to hide Close and the pager would strand a screen reader user.
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  const media = status?.media ?? [];
  const showChrome = chromeVisible || screenReader;
  const go = (delta: number) => gallery.current?.setIndex(current + delta);
  const description = media[current]?.alt;
  const shown = media[current];
  const savable = canSaveMedia && !!shown?.url && shown.kind !== 'audio';

  const save = async () => {
    if (!shown?.url) return;
    setSaving(true);
    try {
      showToast((await saveMedia(shown.url)) ? t('timeline.media.saved') : t('timeline.media.saveDenied'));
    } catch (error) {
      showError(t('timeline.media.saveFailed'), error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  // The gallery calls this on the UI thread.
  const onVerticalPull = ({ translateY, released, velocityY }: VerticalPullOptions) => {
    'worklet';
    if (!released) {
      pull.value = translateY;
    } else if (Math.abs(translateY) > DISMISS_DISTANCE || Math.abs(velocityY) > DISMISS_VELOCITY) {
      scheduleOnRN(router.back);
    } else {
      pull.value = withSpring(0);
    }
  };
  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(pull.value), [0, height / 2], [1, 0.3], 'clamp'),
  }));
  const content = useAnimatedStyle(() => ({ transform: [{ translateY: pull.value }] }));

  return (
    // A native modal sits outside the app's root gesture view, so pinch and double tap need their own.
    <GestureHandlerRootView style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      {media.length > 0 && (
        <Animated.View style={[styles.container, content]}>
          <Gallery
            ref={gallery}
            data={media}
            initialIndex={Number(index)}
            keyExtractor={(m) => m.id}
            renderItem={(m, i) => (
              <MediaItem media={m} active={i === current} label={itemLabel(t, m, i, media.length)} />
            )}
            onIndexChange={setCurrent}
            onTap={() => setChromeVisible((v) => !v)}
            onVerticalPull={onVerticalPull}
          />
        </Animated.View>
      )}

      {showChrome && (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('timeline.media.close')}
              style={styles.close}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={18}
                tintColor={Overlay.onScrim}
              />
            </Pressable>
            {media.length > 1 && (
              <ThemedText type="label" style={styles.onScrim} accessibilityLabel={t('timeline.media.counter', { current: current + 1, total: media.length })}>
                {current + 1} / {media.length}
              </ThemedText>
            )}
            {screenReader && media.length > 1 && (
              <View style={styles.pager}>
                <Pressable
                  onPress={() => go(-1)}
                  disabled={current === 0}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('timeline.media.previous')}
                  accessibilityState={{ disabled: current === 0 }}
                  style={[styles.close, current === 0 && styles.disabled]}>
                  <SymbolView
                    name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
                    size={18}
                    tintColor={Overlay.onScrim}
                  />
                </Pressable>
                <Pressable
                  onPress={() => go(1)}
                  disabled={current === media.length - 1}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('timeline.media.next')}
                  accessibilityState={{ disabled: current === media.length - 1 }}
                  style={[styles.close, current === media.length - 1 && styles.disabled]}>
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                    size={18}
                    tintColor={Overlay.onScrim}
                  />
                </Pressable>
              </View>
            )}
            {savable && (
              <Pressable
                onPress={save}
                disabled={saving}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('timeline.media.save')}
                accessibilityState={{ disabled: saving, busy: saving }}
                style={[styles.close, saving && styles.disabled]}>
                <SymbolView
                  name={{ ios: 'square.and.arrow.down', android: 'download', web: 'download' }}
                  size={18}
                  tintColor={Overlay.onScrim}
                />
              </Pressable>
            )}
          </View>

          {description ? (
            <View style={[styles.caption, { paddingBottom: insets.bottom + Spacing.three }]}>
              <ThemedText style={styles.onScrim} accessible={false}>
                {description}
              </ThemedText>
            </View>
          ) : null}
        </>
      )}
    </GestureHandlerRootView>
  );
}

function itemLabel(t: TFunction, media: Media, index: number, total: number) {
  const description = media.alt || t('timeline.media.noDescription');
  return total > 1 ? t('timeline.media.itemLabel', { current: index + 1, total, description }) : description;
}

function MediaItem({
  media,
  active,
  label,
}: {
  media: Media;
  active: boolean;
  label: string;
}) {
  const { width, height } = useWindowDimensions();
  const [aspect, setAspect] = useState(1);
  const size = fitContainer(aspect, { width, height });

  if (media.kind === 'video' || media.kind === 'gifv' || media.kind === 'audio') {
    return <VideoItem media={media} active={active} label={label} />;
  }

  return (
    <Image
      source={media.url}
      placeholder={media.previewUrl ?? (media.blurhash ? { blurhash: media.blurhash } : undefined)}
      cachePolicy="memory-disk"
      style={size}
      contentFit="contain"
      onLoad={(e) => setAspect(e.source.width / e.source.height)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    />
  );
}

// GIFV is a muted looping clip; video and audio get the platform's controls.
function VideoItem({
  media,
  active,
  label,
}: {
  media: Media;
  active: boolean;
  label: string;
}) {
  const { width, height } = useWindowDimensions();
  const gif = media.kind === 'gifv';
  const [reduceMotion, setReduceMotion] = useState(false);
  const player = useVideoPlayer(media.url ?? null, (p) => {
    p.loop = gif;
    p.muted = gif;
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const allowed = useMediaAutoplay();
  const autoplay = active && allowed && !(gif && reduceMotion);
  useEffect(() => {
    if (autoplay) player.play();
    else player.pause();
  }, [autoplay, player]);

  return (
    <View style={{ width, height }}>
      {media.kind === 'audio' && media.previewUrl ? (
        <Image source={media.previewUrl} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : null}
      <VideoView
        player={player}
        style={{ width, height }}
        contentFit="contain"
        nativeControls={!gif || reduceMotion || !allowed}
        fullscreenOptions={{ enable: !gif }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Overlay.scrim,
  },
  pager: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  disabled: {
    opacity: Press.disabled,
  },
  onScrim: {
    color: Overlay.onScrim,
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    backgroundColor: Overlay.scrim,
  },
});
