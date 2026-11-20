import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { mastodon } from 'masto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useInstance } from '@/api/ap/instance';
import { newPoll } from '@/api/ap/poll';
import { useCapabilities } from '@/api/backend';
import { downloadGif, gifsAvailable, type Gif } from '@/api/gifs';
import { REPLY_AUDIENCES, SELF_LABELS } from '@/api/backend/draft';
import { Button } from '@/components/button';
import { MAX_MEDIA, useCompose } from '@/components/compose-state';
import { GifPicker } from '@/components/gif-picker';
import { NativeMenu } from '@/components/native-menu';
import { Row } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Press, Spacing, TouchTarget, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VISIBILITIES } from '@/model/post';
import { showError } from '@/utils/toast';

const VISIBILITY_ICONS: Record<mastodon.v1.StatusVisibility, SymbolViewProps['name']> = {
  public: { ios: 'globe', android: 'public', web: 'public' },
  unlisted: { ios: 'moon', android: 'nightlight', web: 'nightlight' },
  private: { ios: 'lock', android: 'lock', web: 'lock' },
  direct: { ios: 'at', android: 'alternate_email', web: 'alternate_email' },
};

const VISIBILITY_COLORS: Record<mastodon.v1.StatusVisibility, ThemeColor> = {
  public: 'fediverse',
  unlisted: 'muted',
  private: 'primary',
  direct: 'danger',
};

function ToolButton({
  icon,
  label,
  tint,
  selected = false,
  disabled = false,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  tint?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.tool,
        disabled ? { opacity: Press.disabled } : pressed && { opacity: Press.opacity },
      ]}>
      <SymbolView name={icon} size={20} tintColor={tint ?? (selected ? theme.primary : theme.muted)} />
    </Pressable>
  );
}

export function ComposeOptions({ remaining, canGateReplies }: { remaining: number; canGateReplies: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { editing, kept, media, setMedia, video, setVideo, poll, setPoll, pickImages, showWarning, setShowWarning, emojiOpen, setEmojiOpen, moreOpen, setMoreOpen, visibility, setVisibility, sensitive, setSensitive, selfLabel, setSelfLabel, interactions, setInteractions } =
    useCompose();
  const visibilityLabel = t(`compose.options.visibilities.${visibility}`);
  const capabilities = useCapabilities();
  const pollLimits = useInstance().data?.configuration.polls;
  const currentLabel = t(`compose.options.labels.${selfLabel ?? 'none'}`);
  const currentReplies = t(`compose.options.replyAudiences.${interactions.replies}`);
  const mediaCount = media.length + kept.length;
  const [gifOpen, setGifOpen] = useState(false);
  const [addingGif, setAddingGif] = useState(false);

  const addGif = async (gif: Gif) => {
    setGifOpen(false);
    setAddingGif(true);
    try {
      const uri = await downloadGif(gif);
      // Bluesky animates a GIF only as a video; its video service converts the file.
      if (capabilities.video) {
        setVideo({ uri, description: gif.title, width: gif.width, height: gif.height, size: gif.size, durationMs: 0, mimeType: 'image/gif' });
      } else {
        setMedia((current) => [...current, { uri, description: gif.title }]);
      }
    } catch (error) {
      showError(t('compose.gif.addFailed'), error instanceof Error ? error.message : undefined);
    } finally {
      setAddingGif(false);
    }
  };

  return (
    <View style={[styles.toolbar, { borderTopColor: theme.border }]}>
      <View style={styles.tools}>
        <ToolButton
          icon={{ ios: 'photo', android: 'image', web: 'image' }}
          label={t('compose.options.images', { current: mediaCount, max: MAX_MEDIA })}
          disabled={mediaCount >= MAX_MEDIA || !!poll || !!video || (capabilities.video && addingGif)}
          onPress={pickImages}
        />
        {gifsAvailable && !editing && (
          <ToolButton
            icon={{ ios: 'play.rectangle.on.rectangle', android: 'gif_box', web: 'gif_box' }}
            label={t('compose.gif.add')}
            disabled={addingGif || !!poll || !!video || (capabilities.video ? mediaCount > 0 : mediaCount >= MAX_MEDIA)}
            onPress={() => setGifOpen(true)}
          />
        )}
        {capabilities.polls && pollLimits && (
          <ToolButton
            icon={{ ios: 'chart.bar.xaxis', android: 'poll', web: 'poll' }}
            label={t('compose.options.poll')}
            selected={!!poll}
            disabled={mediaCount > 0}
            onPress={() => setPoll(poll ? null : newPoll(pollLimits))}
          />
        )}
        {capabilities.contentWarning && (
          <ToolButton
            icon={{ ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' }}
            label={t('compose.options.contentWarning')}
            selected={showWarning}
            onPress={() => setShowWarning((v) => !v)}
          />
        )}
        {capabilities.customEmojis && (
          <ToolButton
            icon={{ ios: 'face.smiling', android: 'mood', web: 'mood' }}
            label={t('compose.extras.emoji')}
            selected={emojiOpen}
            onPress={() => setEmojiOpen((v) => !v)}
          />
        )}
        {!editing && capabilities.visibility && (
          <NativeMenu
            label={t('compose.options.visibility')}
            trigger="icon"
            icon={{ name: VISIBILITY_ICONS[visibility], color: theme[VISIBILITY_COLORS[visibility]] }}
            groups={[
              {
                key: 'post',
                items: VISIBILITIES.map((v) => ({
                  key: v,
                  title: t(`compose.options.visibilities.${v}`),
                  icon: visibility === v ? 'checkmark' : 'circle',
                  onPress: () => setVisibility(v),
                })),
              },
            ]}
            renderTrigger={(open) => (
              <ToolButton
                icon={VISIBILITY_ICONS[visibility]}
                tint={theme[VISIBILITY_COLORS[visibility]]}
                label={t('compose.options.visibilityValue', { value: visibilityLabel })}
                onPress={open}
              />
            )}
          />
        )}
        {!editing && (
          <ToolButton
            icon={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
            label={t('compose.extras.moreOptions')}
            selected={moreOpen}
            onPress={() => setMoreOpen((v) => !v)}
          />
        )}
        <ThemedText
          type="meta"
          themeColor={remaining < 0 ? 'danger' : 'muted'}
          accessibilityLabel={t('compose.options.charactersLeft', { count: remaining })}
          accessibilityLiveRegion="polite"
          style={styles.counter}>
          {remaining}
        </ThemedText>
      </View>
      {!capabilities.selfLabels && !editing && media.length > 0 && (
        <Row
          title={t('compose.options.sensitiveMedia')}
          trailing={<Switch value={sensitive} onValueChange={setSensitive} accessibilityLabel={t('compose.options.sensitiveMedia')} />}
        />
      )}
      {capabilities.selfLabels && (media.length > 0 || !!video) && (
        <>
          <Row
            title={t('compose.options.sensitiveMedia')}
            trailing={
              <NativeMenu
                label={currentLabel}
                accessibilityLabel={t('compose.options.sensitiveMediaValue', { value: currentLabel })}
                trigger="text"
                groups={[
                  {
                    key: 'post',
                    items: [null, ...SELF_LABELS].map((label) => ({
                      key: label ?? 'none',
                      title: t(`compose.options.labels.${label ?? 'none'}`),
                      icon: selfLabel === label ? 'checkmark' : 'circle',
                      onPress: () => setSelfLabel(label),
                    })),
                  },
                ]}
                renderTrigger={(open) => (
                  <Button
                    label={currentLabel}
                    accessibilityLabel={t('compose.options.sensitiveMediaValue', { value: currentLabel })}
                    variant="outline"
                    size="small"
                    onPress={open}
                  />
                )}
              />
            }
          />
        </>
      )}
      {capabilities.interactionControls && !editing && (
        <>
          {canGateReplies && (
            <>
              <Row
                title={t('compose.options.whoCanReply')}
                trailing={
                  <NativeMenu
                    label={currentReplies}
                    accessibilityLabel={t('compose.options.whoCanReplyValue', { value: currentReplies })}
                    trigger="text"
                    groups={[
                      {
                        key: 'replies',
                        items: REPLY_AUDIENCES.map((replies) => ({
                          key: replies,
                          title: t(`compose.options.replyAudiences.${replies}`),
                          icon: interactions.replies === replies ? 'checkmark' : 'circle',
                          onPress: () => setInteractions((current) => ({ ...current, replies })),
                        })),
                      },
                    ]}
                    renderTrigger={(open) => (
                      <Button
                        label={currentReplies}
                        accessibilityLabel={t('compose.options.whoCanReplyValue', { value: currentReplies })}
                        variant="outline"
                        size="small"
                        onPress={open}
                      />
                    )}
                  />
                }
              />
            </>
          )}
          <Row
            title={t('compose.options.allowQuotes')}
            role="switch"
            selected={interactions.quotes}
            onPress={() => setInteractions((current) => ({ ...current, quotes: !current.quotes }))}
            trailing={
              <Switch
                value={interactions.quotes}
                onValueChange={(quotes) => setInteractions((current) => ({ ...current, quotes }))}
                trackColor={{ true: theme.primary }}
                accessibilityLabel={t('compose.options.allowQuotes')}
              />
            }
          />
        </>
      )}
      {gifOpen && <GifPicker onClose={() => setGifOpen(false)} onPick={(gif) => void addGif(gif)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tool: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: TouchTarget,
    minHeight: TouchTarget,
  },
  counter: {
    marginLeft: 'auto',
    paddingHorizontal: Spacing.two,
  },
});
