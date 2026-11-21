import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCapabilities } from '@/api/backend';
import type { MediaDraft, MediaFocus } from '@/api/backend/draft';
import type { Media } from '@/model/post';
import { Button } from '@/components/button';
import { ThemedText, textStyles } from '@/components/themed-text';
import { frameless, Hairline, Overlay, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  media: MediaDraft[];
  onChange: (uri: string, change: Partial<MediaDraft> | null) => void;
  focusUri?: string | null;
  onFocused?: () => void;
};

const PRESETS = [
  { key: 'top', focus: { x: 0, y: 1 } },
  { key: 'center', focus: { x: 0, y: 0 } },
  { key: 'bottom', focus: { x: 0, y: -1 } },
  { key: 'left', focus: { x: -1, y: 0 } },
  { key: 'right', focus: { x: 1, y: 0 } },
] as const satisfies { key: string; focus: MediaFocus }[];

export function KeptAttachments({ media, onChange }: { media: Media[]; onChange: (id: string, change: { alt: string } | null) => void }) {
  const theme = useTheme();
  return media.map((m) => (
    <View key={m.id} style={[styles.attachment, { borderTopColor: theme.border }]}>
      <AttachmentRow
        uri={m.url ?? m.previewUrl}
        preview={m.previewUrl ?? m.url}
        alt={m.alt ?? ''}
        onAltChange={(alt) => onChange(m.id, { alt })}
        onRemove={() => onChange(m.id, null)}
      />
    </View>
  ));
}

function AttachmentRow({
  uri,
  preview,
  alt,
  onAltChange,
  onRemove,
  focused = false,
  onFocused,
}: {
  uri: string | null;
  preview: string | null;
  alt: string;
  onAltChange: (alt: string) => void;
  onRemove: () => void;
  focused?: boolean;
  onFocused?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Thumbnail uri={uri} preview={preview} alt={alt} onAltChange={onAltChange} />
      <TextInput
        ref={(input) => {
          if (input && focused) input.focus();
        }}
        onFocus={focused ? onFocused : undefined}
        value={alt}
        onChangeText={onAltChange}
        placeholder={t('compose.attachments.altText')}
        placeholderTextColor={theme.muted}
        selectionColor={theme.primary}
        accessibilityLabel={t('compose.attachments.imageDescription')}
        multiline
        style={[styles.altText, { color: theme.text }]}
      />
      <Pressable onPress={onRemove} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('compose.attachments.removeImage')}>
        <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={22} tintColor={theme.muted} />
      </Pressable>
    </View>
  );
}

function Thumbnail({ uri, preview, alt, onAltChange }: { uri: string | null; preview: string | null; alt: string; onAltChange: (alt: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={t('compose.attachments.describeLarge')}>
        <Image source={preview} style={styles.thumbnail} contentFit="cover" accessibilityIgnoresInvertColors />
        <View style={[styles.expand, { backgroundColor: Overlay.scrim }]}>
          <SymbolView
            name={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' }}
            size={12}
            tintColor={Overlay.onScrim}
          />
        </View>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        {/* A page sheet sits below the status bar on iOS; Android's modal covers the whole screen. */}
        <View style={[styles.sheet, { backgroundColor: theme.page }, Platform.OS === 'android' && { paddingTop: insets.top + Spacing.three }]}>
          <View style={styles.sheetHeader}>
            <ThemedText type="name" accessibilityRole="header">{t('compose.attachments.imageDescription')}</ThemedText>
            <Button label={t('common.done')} size="small" onPress={() => setOpen(false)} />
          </View>
          {/* Above the image, so a tall image never pushes it under the keyboard. */}
          <TextInput
            value={alt}
            onChangeText={onAltChange}
            placeholder={t('compose.attachments.altText')}
            placeholderTextColor={theme.muted}
            selectionColor={theme.primary}
            accessibilityLabel={t('compose.attachments.imageDescription')}
            autoFocus
            multiline
            style={[styles.altText, styles.sheetAlt, { color: theme.text }]}
          />
          <Image source={uri} style={styles.sheetImage} contentFit="contain" accessibilityIgnoresInvertColors />
        </View>
      </Modal>
    </>
  );
}

export function ComposeAttachments({ media, onChange, focusUri, onFocused }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [focusing, setFocusing] = useState<string | null>(null);
  const focusable = useCapabilities().mediaFocus;

  return media.map((m) => (
    <View key={m.uri} style={[styles.attachment, { borderTopColor: theme.border }]}>
      <AttachmentRow
        uri={m.uri}
        preview={m.uri}
        alt={m.description}
        onAltChange={(description) => onChange(m.uri, { description })}
        onRemove={() => onChange(m.uri, null)}
        focused={focusUri === m.uri}
        onFocused={onFocused}
      />
      {focusable && (
      <View style={styles.row}>
        <Button
          label={m.focus ? t('compose.attachments.editFocus') : t('compose.attachments.setFocus')}
          variant="outline"
          size="small"
          selected={focusing === m.uri}
          onPress={() => setFocusing(focusing === m.uri ? null : m.uri)}
        />
      </View>
      )}
      {focusable && focusing === m.uri && <FocusPicker draft={m} onChange={(focus) => onChange(m.uri, { focus })} />}
    </View>
  ));
}

// Focus runs from -1 to 1 with y up, as in Mastodon and GoToSocial.
function FocusPicker({ draft, onChange }: { draft: MediaDraft; onChange: (focus: MediaFocus | undefined) => void }) {
  const { t } = useTranslation();
  const [ratio, setRatio] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const focus = draft.focus ?? { x: 0, y: 0 };

  return (
    <View style={styles.picker}>
      <Pressable
        onPress={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          const clamp = (n: number) => Math.max(-1, Math.min(1, n));
          onChange({ x: clamp((locationX / size.width) * 2 - 1), y: clamp(1 - (locationY / size.height) * 2) });
        }}
        onLayout={(e) => setSize(e.nativeEvent.layout)}
        accessibilityRole="button"
        accessibilityLabel={t('compose.attachments.focusPoint')}
        accessibilityHint={t('compose.attachments.focusHint')}
        style={[styles.preview, { aspectRatio: ratio }]}>
        <Image
          source={draft.uri}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          onLoad={(e) => setRatio(e.source.width / e.source.height)}
          accessibilityIgnoresInvertColors
        />
        <View
          pointerEvents="none"
          style={[
            styles.marker,
            { left: `${((focus.x + 1) / 2) * 100}%`, top: `${((1 - focus.y) / 2) * 100}%`, borderColor: Overlay.onScrim },
          ]}
        />
      </Pressable>
      <View style={styles.presets}>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            label={t(`compose.attachments.presets.${p.key}`)}
            variant="outline"
            size="small"
            accessibilityLabel={t('compose.attachments.focusPreset', {
              position: t(`compose.attachments.presets.${p.key}`).toLowerCase(),
            })}
            onPress={() => onChange(p.focus)}
          />
        ))}
        {draft.focus && (
          <Button label={t('compose.attachments.reset')} variant="outline" size="small" onPress={() => onChange(undefined)} />
        )}
      </View>
      <ThemedText type="meta">{t('compose.attachments.focusOptional')}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  attachment: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: Hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  altText: {
    ...frameless,
    flex: 1,
    ...textStyles.input,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  sheet: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expand: {
    position: 'absolute',
    right: Spacing.one,
    bottom: Spacing.one,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAlt: {
    flex: 0,
    minHeight: 120,
  },
  sheetImage: {
    flex: 1,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  picker: {
    gap: Spacing.two,
  },
  preview: {
    width: '100%',
    maxHeight: 360,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    borderWidth: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
});
