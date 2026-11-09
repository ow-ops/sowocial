import type { mastodon } from 'masto';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { REPLY_AUDIENCES, SELF_LABELS } from '@/api/bsky/compose';
import { Button } from '@/components/button';
import { MAX_MEDIA, useCompose } from '@/components/compose-state';
import { NativeMenu } from '@/components/native-menu';
import { Row } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const VISIBILITIES: mastodon.v1.StatusVisibility[] = ['public', 'unlisted', 'private', 'direct'];

export function ComposeOptions({ remaining, canGateReplies }: { remaining: number; canGateReplies: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { editing, kept, media, video, pickImages, showWarning, setShowWarning, visibility, setVisibility, selfLabel, setSelfLabel, interactions, setInteractions } =
    useCompose();
  const capabilities = useCapabilities();
  const currentLabel = t(`compose.options.labels.${selfLabel ?? 'none'}`);
  const currentReplies = t(`compose.options.replyAudiences.${interactions.replies}`);
  // Edits cannot change visibility or attachments here.
  const mediaCount = media.length + kept.length;
  const maxMedia = editing ? kept.length : MAX_MEDIA;
  return (
    <View style={[styles.toolbar, { borderTopColor: theme.border }]}>
      <View style={styles.row}>
        <Button
          label={t('compose.options.images', { current: mediaCount, max: maxMedia })}
          variant="outline"
          size="small"
          disabled={!!editing || mediaCount >= maxMedia}
          onPress={pickImages}
        />
        {capabilities.contentWarning && (
          <Button
            label={t('compose.options.contentWarning')}
            size="small"
            role="togglebutton"
            selected={showWarning}
            onPress={() => setShowWarning((v) => !v)}
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
      {!editing && capabilities.visibility && (
        <>
          <ThemedText type="meta" accessibilityRole="header">
            {t('compose.options.visibility')}
          </ThemedText>
          <View style={styles.row} accessibilityRole="radiogroup">
            {VISIBILITIES.map((v) => (
              <Button
                key={v}
                label={t(`compose.options.visibilities.${v}`)}
                size="small"
                role="radio"
                selected={visibility === v}
                onPress={() => setVisibility(v)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
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
