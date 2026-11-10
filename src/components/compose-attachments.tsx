import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useCapabilities } from '@/api/backend';
import type { MediaDraft, MediaFocus } from '@/api/ap/upload';
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

export function ComposeAttachments({ media, onChange, focusUri, onFocused }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [focusing, setFocusing] = useState<string | null>(null);
  const focusable = useCapabilities().mediaFocus;

  return media.map((m) => (
    <View key={m.uri} style={[styles.attachment, { borderTopColor: theme.border }]}>
      <View style={styles.row}>
        <Image source={m.uri} style={styles.thumbnail} contentFit="cover" accessibilityIgnoresInvertColors />
        <TextInput
          ref={(input) => {
            if (input && focusUri === m.uri) input.focus();
          }}
          onFocus={focusUri === m.uri ? onFocused : undefined}
          value={m.description}
          onChangeText={(description) => onChange(m.uri, { description })}
          placeholder={t('compose.attachments.altText')}
          placeholderTextColor={theme.muted}
          selectionColor={theme.primary}
          accessibilityLabel={t('compose.attachments.imageDescription')}
          multiline
          style={[styles.altText, { color: theme.text }]}
        />
        <Pressable
          onPress={() => onChange(m.uri, null)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('compose.attachments.removeImage')}>
          <SymbolView
            name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
            size={22}
            tintColor={theme.muted}
          />
        </Pressable>
      </View>
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
