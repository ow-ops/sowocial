import { formatDuration, intervalToDuration } from 'date-fns';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { expiryChoices, type PollLimits } from '@/api/ap/poll';
import type { PollDraft } from '@/api/backend/types';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText, useTextStyle } from '@/components/themed-text';
import { Hairline, Spacing } from '@/constants/theme';
import { dateLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';

const duration = (seconds: number) =>
  formatDuration(intervalToDuration({ start: 0, end: seconds * 1000 }), { locale: dateLocale(), format: ['days', 'hours', 'minutes'] });

type Props = {
  poll: PollDraft;
  limits: PollLimits;
  onChange: (poll: PollDraft) => void;
  onRemove: () => void;
  resetsVotes?: boolean;
};

export function ComposePoll({ poll, limits, onChange, onRemove, resetsVotes }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const bodyStyle = useTextStyle('body');
  const setOption = (index: number, value: string) =>
    onChange({ ...poll, options: poll.options.map((o, i) => (i === index ? value : o)) });
  const removeOption = (index: number) => onChange({ ...poll, options: poll.options.filter((_, i) => i !== index) });

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      {poll.options.map((option, index) => (
        <View key={index} style={styles.option}>
          <TextField
            value={option}
            onChangeText={(value) => setOption(index, value)}
            maxLength={limits.maxCharactersPerOption}
            placeholder={t('compose.poll.option', { number: index + 1 })}
            accessibilityLabel={t('compose.poll.option', { number: index + 1 })}
            style={[styles.field, bodyStyle]}
          />
          {poll.options.length > 2 && (
            <Pressable
              onPress={() => removeOption(index)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('compose.poll.removeOption', { number: index + 1 })}>
              <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={22} tintColor={theme.muted} />
            </Pressable>
          )}
        </View>
      ))}
      <View style={styles.row}>
        <Button
          label={t('compose.poll.addOption')}
          variant="outline"
          size="small"
          disabled={poll.options.length >= limits.maxOptions}
          onPress={() => onChange({ ...poll, options: [...poll.options, ''] })}
        />
        <Button
          label={t('compose.poll.multiple')}
          size="small"
          role="switch"
          selected={poll.multiple}
          onPress={() => onChange({ ...poll, multiple: !poll.multiple })}
        />
        <Button
          label={t('compose.poll.hideTotals')}
          size="small"
          role="switch"
          selected={poll.hideTotals}
          onPress={() => onChange({ ...poll, hideTotals: !poll.hideTotals })}
        />
      </View>
      <ThemedText type="meta" accessibilityRole="header">
        {t('compose.poll.duration')}
      </ThemedText>
      <View style={styles.row} accessibilityRole="radiogroup">
        {expiryChoices(limits, poll.expiresIn).map((seconds) => (
          <Button
            key={seconds}
            label={duration(seconds)}
            size="small"
            role="radio"
            selected={poll.expiresIn === seconds}
            onPress={() => onChange({ ...poll, expiresIn: seconds })}
          />
        ))}
      </View>
      {resetsVotes && <ThemedText type="meta">{t('compose.poll.resetsVotes')}</ThemedText>}
      <View style={styles.row}>
        <Button label={t('compose.poll.remove')} variant="outline" size="small" onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: Hairline,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  field: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
