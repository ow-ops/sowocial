import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { checkVideoLimits, type VideoDraft, type VideoProgress } from '@/api/bsky/video';
import { useBsky } from '@/api/client';
import { Button } from '@/components/button';
import { ThemedText, textStyles } from '@/components/themed-text';
import { frameless, Hairline, Pill, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  video: VideoDraft | null;
  onChange: (video: VideoDraft | null) => void;
  hasImages: boolean;
  progress: VideoProgress | null;
  busy: boolean;
};

export function ComposeVideo({ video, onChange, hasImages, progress, busy }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const agent = useBsky();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', allowsMultipleSelection: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    const draft: VideoDraft = {
      uri: asset.uri,
      description: '',
      width: asset.width,
      height: asset.height,
      size: asset.fileSize ?? new File(asset.uri).size,
      durationMs: asset.duration ?? 0,
      mimeType: asset.mimeType ?? 'video/mp4',
    };
    setChecking(true);
    try {
      await checkVideoLimits(agent, draft);
      onChange(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('compose.video.limitsFailed', { status: 0 }));
    } finally {
      setChecking(false);
    }
  };

  if (!video) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Button
            label={t('compose.video.add')}
            variant="outline"
            size="small"
            disabled={hasImages}
            loading={checking}
            onPress={() => void pick()}
          />
          {hasImages && <ThemedText type="meta">{t('compose.video.exclusive')}</ThemedText>}
        </View>
        {error && (
          <ThemedText themeColor="danger" selectable accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.attached, { borderTopColor: theme.border }]}>
      <VideoPreview video={video} />
      <View style={styles.row}>
        <TextInput
          value={video.description}
          onChangeText={(description) => onChange({ ...video, description })}
          placeholder={t('compose.video.altText')}
          placeholderTextColor={theme.muted}
          selectionColor={theme.primary}
          accessibilityLabel={t('compose.video.description')}
          editable={!busy}
          multiline
          style={[styles.altText, { color: theme.text }]}
        />
        {!busy && (
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('compose.video.remove')}>
            <SymbolView
              name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
              size={22}
              tintColor={theme.muted}
            />
          </Pressable>
        )}
      </View>
      <ThemedText type="meta">
        {t('compose.video.details', { seconds: Math.round(video.durationMs / 1000), megabytes: (video.size / 1_000_000).toFixed(1) })}
      </ThemedText>
      {busy && progress && <UploadProgress progress={progress} />}
    </View>
  );
}

function VideoPreview({ video }: { video: VideoDraft }) {
  const { t } = useTranslation();
  const player = useVideoPlayer(video.uri);
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      accessibilityLabel={t('compose.video.preview')}
      style={[styles.preview, { aspectRatio: video.width && video.height ? video.width / video.height : 16 / 9 }]}
    />
  );
}

function UploadProgress({ progress }: { progress: VideoProgress }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const percent = Math.round(progress.progress * 100);
  const label =
    progress.stage === 'checking'
      ? t('compose.video.stage.checking')
      : t(`compose.video.stage.${progress.stage}`, { percent });
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      accessibilityLiveRegion="polite">
      <View style={[styles.track, { backgroundColor: theme.surface }]}>
        <View style={[styles.fill, { backgroundColor: theme.primary, width: `${percent}%` }]} />
      </View>
      <ThemedText type="meta">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  attached: {
    paddingTop: Spacing.three,
    borderTopWidth: Hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  preview: {
    width: '100%',
    maxHeight: 360,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  altText: {
    ...frameless,
    flex: 1,
    ...textStyles.input,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  progress: {
    gap: Spacing.one,
  },
  track: {
    height: 6,
    borderRadius: Pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Pill,
  },
});
