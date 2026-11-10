import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import type { MediaDraft } from '@/api/ap/upload';
import { Button } from '@/components/button';
import { ComposeAttachments } from '@/components/compose-attachments';
import { MAX_MEDIA, pickImageDrafts, type ThreadSegment } from '@/components/compose-state';
import { ThemedText, useTextStyle } from '@/components/themed-text';
import { frameless, Hairline, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  segments: ThreadSegment[];
  onChange: (index: number, change: Partial<ThreadSegment> | null) => void;
  onAdd: () => void;
  canAdd: boolean;
  remainingOf: (text: string) => number;
  focusUri?: string | null;
  onFocused?: () => void;
};

export function ComposeThread({ segments, onChange, onAdd, canAdd, remainingOf, focusUri, onFocused }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const bodyStyle = useTextStyle('body');

  const changeMedia = (index: number, uri: string, change: Partial<MediaDraft> | null) =>
    onChange(index, {
      media: segments[index].media.flatMap((m) => (m.uri !== uri ? [m] : change === null ? [] : [{ ...m, ...change }])),
    });

  const addImages = async (index: number) => {
    const picked = await pickImageDrafts(MAX_MEDIA - segments[index].media.length);
    onChange(index, { media: [...segments[index].media, ...picked].slice(0, MAX_MEDIA) });
  };

  return (
    <>
      {segments.map((segment, index) => {
        const remaining = remainingOf(segment.text);
        const label = t('compose.thread.post', { number: index + 2 });
        return (
          <View key={index} style={[styles.segment, { borderTopColor: theme.border }]}>
            <ThemedText type="meta" accessibilityRole="header">
              {label}
            </ThemedText>
            <TextInput
              value={segment.text}
              onChangeText={(text) => onChange(index, { text })}
              placeholder={t('compose.thread.placeholder')}
              placeholderTextColor={theme.muted}
              selectionColor={theme.primary}
              multiline
              accessibilityLabel={label}
              style={[styles.text, bodyStyle, { color: theme.heading }]}
            />
            <ComposeAttachments
              media={segment.media}
              onChange={(uri, change) => changeMedia(index, uri, change)}
              focusUri={focusUri}
              onFocused={onFocused}
            />
            <View style={styles.row}>
              <Button
                label={t('compose.options.images', { current: segment.media.length, max: MAX_MEDIA })}
                variant="outline"
                size="small"
                disabled={segment.media.length >= MAX_MEDIA}
                onPress={() => void addImages(index)}
              />
              <Button
                label={t('compose.thread.remove')}
                accessibilityLabel={t('compose.thread.removeA11y', { number: index + 2 })}
                variant="outline"
                size="small"
                onPress={() => onChange(index, null)}
              />
              <ThemedText
                type="meta"
                themeColor={remaining < 0 ? 'danger' : 'muted'}
                accessibilityLabel={t('compose.options.charactersLeft', { count: remaining })}
                style={styles.counter}>
                {remaining}
              </ThemedText>
            </View>
          </View>
        );
      })}
      <View style={styles.row}>
        <Button label={t('compose.thread.add')} variant="outline" size="small" disabled={!canAdd} onPress={onAdd} />
        {!canAdd && <ThemedText type="meta">{t('compose.thread.unavailable')}</ThemedText>}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  segment: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: Hairline,
  },
  text: {
    ...frameless,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  counter: {
    marginLeft: 'auto',
  },
});
