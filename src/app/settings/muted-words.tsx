import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from 'react-native';

import { useAddMutedWord, useMutedWords, useRemoveMutedWord } from '@/api/bsky/muted-words';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { intlLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';

const TARGETS = ['content', 'tag'] as const;

const DAY = 24 * 60 * 60 * 1000;
const DURATIONS = [
  { label: 'forever', ms: null },
  { label: 'day1', ms: DAY },
  { label: 'days7', ms: 7 * DAY },
  { label: 'days30', ms: 30 * DAY },
] as const;

export default function MutedWords() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: words, isPending, error, refetch } = useMutedWords();
  const add = useAddMutedWord();
  const remove = useRemoveMutedWord();
  const [value, setValue] = useState('');
  const [targets, setTargets] = useState<string[]>(['content', 'tag']);
  const [excludeFollowing, setExcludeFollowing] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const toggleTarget = (target: string) =>
    setTargets((all) => (all.includes(target) ? all.filter((x) => x !== target) : [...all, target]));
  const canAdd = value.trim().length > 0 && targets.length > 0;
  const expiry = (expiresAt?: string) => {
    if (!expiresAt) return undefined;
    const at = new Date(expiresAt);
    return at < new Date() ? t('settings.mutedWords.expired') : t('settings.mutedWords.until', { date: at.toLocaleDateString(intlLocale()) });
  };
  const submit = () =>
    add.mutate(
      {
        value,
        targets,
        actorTarget: excludeFollowing ? 'exclude-following' : 'all',
        expiresAt: duration ? new Date(Date.now() + duration).toISOString() : undefined,
      },
      { onSuccess: () => setValue('') },
    );

  return (
    <SettingsScreen title={t('settings.mutedWords.title')}>
      <Section title={t('settings.mutedWords.title')}>
        <ThemedText type="meta">{t('settings.mutedWords.intro')}</ThemedText>
        <QueryState
          pending={isPending}
          error={error}
          emptyText={words?.length === 0 ? t('settings.mutedWords.none') : undefined}
          onRetry={() => void refetch()}
        />
        {words?.map((word) => (
          <Row
            key={word.id ?? word.value}
            title={word.value}
            detail={[
              word.targets.map((target) => t(`settings.mutedWords.${target}Target`, { defaultValue: target })).join(', '),
              word.actorTarget === 'exclude-following' ? t('settings.mutedWords.excludeFollowing') : null,
              expiry(word.expiresAt),
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={
              <Button
                label={t('common.remove')}
                accessibilityLabel={t('settings.mutedWords.removeLabel', { word: word.value })}
                size="small"
                variant="outline"
                onPress={() => remove.mutate(word)}
              />
            }
          />
        ))}
      </Section>

      <Section title={t('settings.mutedWords.add')}>
        <TextField
          value={value}
          onChangeText={setValue}
          onSubmitEditing={() => canAdd && submit()}
          placeholder={t('settings.mutedWords.placeholder')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel={t('settings.mutedWords.newLabel')}
        />
      </Section>

      <Section title={t('settings.mutedWords.targets')}>
        {TARGETS.map((target) => (
          <Row
            key={target}
            title={t(`settings.mutedWords.${target}Target`)}
            role="switch"
            selected={targets.includes(target)}
            onPress={() => toggleTarget(target)}
            trailing={
              <Switch
                value={targets.includes(target)}
                onValueChange={() => toggleTarget(target)}
                trackColor={{ true: theme.primary }}
                accessibilityLabel={t(`settings.mutedWords.${target}Target`)}
              />
            }
          />
        ))}
        <Row
          title={t('settings.mutedWords.excludeFollowing')}
          role="switch"
          selected={excludeFollowing}
          onPress={() => setExcludeFollowing((on) => !on)}
          trailing={
            <Switch
              value={excludeFollowing}
              onValueChange={setExcludeFollowing}
              trackColor={{ true: theme.primary }}
              accessibilityLabel={t('settings.mutedWords.excludeFollowing')}
            />
          }
        />
      </Section>

      <Section title={t('settings.mutedWords.duration')}>
        {DURATIONS.map((d) => (
          <Row
            key={d.label}
            title={t(`settings.mutedWords.${d.label}`)}
            role="radio"
            selected={duration === d.ms}
            onPress={() => setDuration(d.ms)}
          />
        ))}
      </Section>

      {!canAdd && <ThemedText type="meta">{t('settings.mutedWords.needMore')}</ThemedText>}
      <Button label={t('settings.mutedWords.add')} disabled={!canAdd} loading={add.isPending} onPress={submit} />
    </SettingsScreen>
  );
}
