import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { mastodon } from 'masto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useInstance } from '@/api/ap/instance';
import { newPoll } from '@/api/ap/poll';
import { useCapabilities } from '@/api/backend';
import { downloadGif, gifsAvailable, type Gif } from '@/api/gifs';
import { REPLY_AUDIENCES, SELF_LABELS } from '@/api/backend/draft';
import { changedSettings, ComposeMoreSheet } from '@/components/compose-extras';
import { MAX_MEDIA, useCompose } from '@/components/compose-state';
import { EmojiPicker } from '@/components/emoji-picker';
import { GifPicker } from '@/components/gif-picker';
import { NativeMenu } from '@/components/native-menu';
import { ThemedText } from '@/components/themed-text';
import { Hairline, Pill, Press, Spacing, TouchTarget, type ThemeColor } from '@/constants/theme';
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
  selected = false,
  disabled = false,
  onPress,
  children,
}: {
  icon?: SymbolViewProps['name'];
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
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
      {children ?? (icon && <SymbolView name={icon} size={20} tintColor={selected ? theme.primary : theme.muted} />)}
    </Pressable>
  );
}

// SF Symbols has no GIF glyph, so every platform uses this one to match.
function GifGlyph({ tint }: { tint: string }) {
  return (
    <View style={[styles.gif, { borderColor: tint }]}>
      <ThemedText style={[styles.gifText, { color: tint }]}>GIF</ThemedText>
    </View>
  );
}

function Chip({
  icon,
  label,
  accessibilityLabel,
  selected = false,
  role = 'button',
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  accessibilityLabel?: string;
  selected?: boolean;
  role?: 'button' | 'switch';
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = selected ? theme.primary : theme.text;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={role === 'switch' ? { checked: selected } : undefined}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? theme.primary : theme.border, backgroundColor: theme.surface },
        pressed && { opacity: Press.opacity },
      ]}>
      <SymbolView name={icon} size={14} tintColor={tint} />
      <ThemedText type="labelSmall" style={{ color: tint }} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function VisibilityPill() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { visibility, setVisibility } = useCompose();
  const label = t(`compose.options.visibilities.${visibility}`);
  const tint = theme[VISIBILITY_COLORS[visibility]];
  return (
    <NativeMenu
      label={t('compose.options.visibility')}
      trigger="custom"
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
        <Pressable
          onPress={open}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('compose.options.visibilityValue', { value: label })}
          style={({ pressed }) => [styles.chip, { borderColor: tint }, pressed && { opacity: Press.opacity }]}>
          <SymbolView name={VISIBILITY_ICONS[visibility]} size={14} tintColor={tint} />
          <ThemedText type="labelSmall" style={{ color: tint }}>
            {label}
          </ThemedText>
          <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={12} tintColor={tint} />
        </Pressable>
      )}
    />
  );
}

export function ComposeOptions({
  remaining,
  canGateReplies,
  canAddPost,
}: {
  remaining: number;
  canGateReplies: boolean;
  canAddPost: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const state = useCompose();
  const { editing, kept, media, setMedia, video, setVideo, poll, setPoll, pickImages, showWarning, setShowWarning, emojiOpen, setEmojiOpen, moreOpen, setMoreOpen, sensitive, setSensitive, selfLabel, setSelfLabel, interactions, setInteractions, setExtras, insertEmoji } =
    state;
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

  const toggleEmoji = () => {
    if (!emojiOpen) Keyboard.dismiss();
    setEmojiOpen(!emojiOpen);
  };

  const sensitiveChip = !capabilities.selfLabels && !editing && media.length > 0 && (
    <Chip
      icon={{ ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }}
      label={t('compose.options.sensitiveMedia')}
      role="switch"
      selected={sensitive}
      onPress={() => setSensitive(!sensitive)}
    />
  );

  const labelChip = capabilities.selfLabels && (media.length > 0 || !!video) && (
    <NativeMenu
      label={currentLabel}
      trigger="custom"
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
        <Chip
          icon={{ ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }}
          label={selfLabel ? currentLabel : t('compose.options.sensitiveMedia')}
          accessibilityLabel={t('compose.options.sensitiveMediaValue', { value: currentLabel })}
          selected={!!selfLabel}
          onPress={open}
        />
      )}
    />
  );

  const gates = capabilities.interactionControls && !editing;
  const replyChip = gates && canGateReplies && (
    <NativeMenu
      label={currentReplies}
      trigger="custom"
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
        <Chip
          icon={{ ios: 'arrowshape.turn.up.left', android: 'reply', web: 'reply' }}
          label={t('compose.options.whoCanReplyValue', { value: currentReplies })}
          onPress={open}
        />
      )}
    />
  );

  const quoteChip = gates && (
    <Chip
      icon={{ ios: 'quote.opening', android: 'format_quote', web: 'format_quote' }}
      label={t('compose.options.allowQuotes')}
      role="switch"
      selected={interactions.quotes}
      onPress={() => setInteractions((current) => ({ ...current, quotes: !current.quotes }))}
    />
  );

  const changed = editing ? [] : changedSettings(state, t);
  const hasChips = !!(sensitiveChip || labelChip || replyChip || quoteChip || changed.length);

  return (
    <View style={[styles.footer, { backgroundColor: theme.page, borderTopColor: theme.border }]}>
      {hasChips && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.chips}>
          {replyChip}
          {quoteChip}
          {sensitiveChip}
          {labelChip}
          {changed.map((label) => (
            <Chip
              key={label}
              icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
              label={label}
              onPress={() => setMoreOpen(true)}
            />
          ))}
        </ScrollView>
      )}

      <View style={[styles.toolbar, hasChips && { borderTopColor: theme.border, borderTopWidth: Hairline }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={styles.toolScroll}
          contentContainerStyle={styles.tools}>
          <ToolButton
            icon={{ ios: 'photo', android: 'image', web: 'image' }}
            label={t('compose.options.images', { current: mediaCount, max: MAX_MEDIA })}
            disabled={mediaCount >= MAX_MEDIA || !!poll || !!video || (capabilities.video && addingGif)}
            onPress={pickImages}
          />
          {gifsAvailable && !editing && (
            <ToolButton
              label={t('compose.gif.add')}
              disabled={addingGif || !!poll || !!video || (capabilities.video ? mediaCount > 0 : mediaCount >= MAX_MEDIA)}
              onPress={() => setGifOpen(true)}>
              <GifGlyph tint={theme.muted} />
            </ToolButton>
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
              onPress={toggleEmoji}
            />
          )}
          {!editing && (
            <ToolButton
              icon={{ ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' }}
              label={t('compose.extras.moreOptions')}
              selected={moreOpen}
              onPress={() => setMoreOpen(true)}
            />
          )}
        </ScrollView>
        {!editing && (
          <ToolButton
            icon={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
            label={t('compose.thread.add')}
            disabled={!canAddPost}
            onPress={() => setExtras((current) => [...current, { text: '', media: [] }])}
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

      {emojiOpen && (
        <View style={styles.emoji}>
          <EmojiPicker onPick={insertEmoji} />
        </View>
      )}

      {gifOpen && <GifPicker onClose={() => setGifOpen(false)} onPick={(gif) => void addGif(gif)} />}
      {!editing && <ComposeMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: Hairline,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 32,
    paddingHorizontal: Spacing.oneHalf,
    borderRadius: Pill,
    borderWidth: Hairline,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.one,
    paddingRight: Spacing.three,
  },
  toolScroll: {
    flexShrink: 1,
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
  gif: {
    borderWidth: 1.5,
    borderRadius: 5,
    borderCurve: 'continuous',
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  gifText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  counter: {
    minWidth: 32,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emoji: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
