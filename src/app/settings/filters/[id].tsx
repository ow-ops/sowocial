import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { mastodon } from 'masto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';

import { useDeleteFilter, useFilters, useSaveFilter } from '@/api/ap/filters';
import { Button } from '@/components/button';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { intlLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/utils/dialog';
import { showError } from '@/utils/toast';

type Context = mastodon.v2.FilterContext;
type Keyword = { id?: string; keyword: string; wholeWord: boolean };

const CONTEXTS: Context[] = ['home', 'notifications', 'public', 'thread', 'account'];

const ACTIONS: { value: 'warn' | 'hide'; label: 'collapse' | 'hide' }[] = [
  { value: 'warn', label: 'collapse' },
  { value: 'hide', label: 'hide' },
];

const EXPIRIES = [
  { label: 'never', seconds: null },
  { label: 'minutes30', seconds: 30 * 60 },
  { label: 'hour1', seconds: 60 * 60 },
  { label: 'hours6', seconds: 6 * 60 * 60 },
  { label: 'day1', seconds: 24 * 60 * 60 },
  { label: 'week1', seconds: 7 * 24 * 60 * 60 },
] as const;

type Expiry = number | null | undefined;

export default function FilterRoute() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { data: filters, isPending } = useFilters();
  const existing = filters?.find((f) => f.id === id);
  if (id === 'new' || existing) return <FilterEditor existing={existing} />;
  return (
    <SettingsScreen>
      {isPending ? <ActivityIndicator color={theme.muted} /> : <ThemedText>{t('settings.filters.notFound')}</ThemedText>}
    </SettingsScreen>
  );
}

function FilterEditor({ existing }: { existing?: mastodon.v2.Filter }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isNew = !existing;
  const id = existing?.id ?? 'new';
  const save = useSaveFilter();
  const remove = useDeleteFilter();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [context, setContext] = useState<Context[]>(existing?.context ?? ['home']);
  const [action, setAction] = useState<'warn' | 'hide'>(existing?.filterAction === 'hide' ? 'hide' : 'warn');
  const [keywords, setKeywords] = useState<Keyword[]>(
    existing?.keywords.map((k) => ({ id: k.id, keyword: k.keyword, wholeWord: k.wholeWord })) ?? [],
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<Expiry>(isNew ? null : undefined);
  const [newKeyword, setNewKeyword] = useState('');

  const addKeyword = () => {
    const keyword = newKeyword.trim();
    if (!keyword) return;
    setKeywords((all) => [...all, { keyword, wholeWord: true }]);
    setNewKeyword('');
  };
  const removeKeyword = (index: number) => {
    const { id: keywordId } = keywords[index];
    if (keywordId) setRemoved((all) => [...all, keywordId]);
    setKeywords((all) => all.filter((_, i) => i !== index));
  };
  const toggleContext = (value: Context) =>
    setContext((all) => (all.includes(value) ? all.filter((c) => c !== value) : [...all, value]));

  const canSave = title.trim().length > 0 && context.length > 0 && keywords.length > 0;
  const submit = () =>
    save.mutate(
      {
        id: isNew ? undefined : id,
        title: title.trim(),
        context,
        filterAction: action,
        expiresIn: expiry,
        keywords,
        removedKeywordIds: removed,
      },
      { onSuccess: () => router.back(), onError: (e) => showError(t('settings.filters.saveFailed'), e.message) },
    );

  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: isNew ? t('settings.filters.new') : t('settings.filters.editTitle') }} />

      <Section title={t('settings.filters.name')}>
        <TextField value={title} onChangeText={setTitle} placeholder={t('settings.filters.namePlaceholder')} accessibilityLabel={t('settings.filters.namePlaceholder')} />
      </Section>

      <Section title={t('settings.filters.keywordsSection')}>
        {keywords.map((k, i) => (
          <Row
            key={k.id ?? `${k.keyword}-${i}`}
            title={k.keyword}
            detail={k.wholeWord ? t('settings.filters.wholeWord') : t('settings.filters.insideWords')}
            trailing={
              <View style={styles.keywordActions}>
                <Switch
                  value={k.wholeWord}
                  onValueChange={(wholeWord) =>
                    setKeywords((all) => all.map((x, j) => (j === i ? { ...x, wholeWord } : x)))
                  }
                  trackColor={{ true: theme.primary }}
                  accessibilityLabel={t('settings.filters.wholeWordLabel', { keyword: k.keyword })}
                />
                <Button label={t('common.remove')} accessibilityLabel={t('settings.filters.removeLabel', { keyword: k.keyword })} size="small" variant="outline" onPress={() => removeKeyword(i)} />
              </View>
            }
          />
        ))}
        <TextField
          value={newKeyword}
          onChangeText={setNewKeyword}
          onSubmitEditing={addKeyword}
          placeholder={t('settings.filters.addPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel={t('settings.filters.newKeywordLabel')}
        />
        <Button label={t('settings.filters.addKeyword')} variant="outline" disabled={!newKeyword.trim()} onPress={addKeyword} />
      </Section>

      <Section title={t('settings.filters.applyIn')}>
        {CONTEXTS.map((c) => (
          <Row
            key={c}
            title={t(`settings.filters.contexts.${c}`)}
            role="switch"
            selected={context.includes(c)}
            onPress={() => toggleContext(c)}
            trailing={
              <Switch
                value={context.includes(c)}
                onValueChange={() => toggleContext(c)}
                trackColor={{ true: theme.primary }}
                accessibilityLabel={t(`settings.filters.contexts.${c}`)}
              />
            }
          />
        ))}
      </Section>

      <Section title={t('settings.filters.whenMatches')}>
        {ACTIONS.map((a) => (
          <Row
            key={a.value}
            title={t(`settings.filters.${a.label}`)}
            detail={t(`settings.filters.${a.label}Detail`)}
            role="radio"
            selected={action === a.value}
            onPress={() => setAction(a.value)}
          />
        ))}
      </Section>

      <Section title={t('settings.filters.expires')}>
        {!isNew && (
          <Row
            title={
              existing?.expiresAt
                ? t('settings.filters.keepDate', { date: new Date(existing.expiresAt).toLocaleString(intlLocale()) })
                : t('settings.filters.keepNever')
            }
            role="radio"
            selected={expiry === undefined}
            onPress={() => setExpiry(undefined)}
          />
        )}
        {EXPIRIES.map((e) => (
          <Row
            key={e.label}
            title={t(`settings.filters.${e.label}`)}
            role="radio"
            selected={expiry === e.seconds}
            onPress={() => setExpiry(e.seconds)}
          />
        ))}
      </Section>

      <View style={styles.actions}>
        {!canSave && (
          <ThemedText type="meta">{t('settings.filters.needMore')}</ThemedText>
        )}
        <Button label={t('common.save')} disabled={!canSave} loading={save.isPending} onPress={submit} />
        {existing && (
          <Button
            label={t('settings.filters.deleteFilter')}
            variant="outline"
            onPress={() =>
              confirmAction(t('settings.filters.deleteConfirm', { title: existing.title }), t('common.delete'), () =>
                remove.mutate(id, {
                  onSuccess: () => router.back(),
                  onError: (e) => showError(t('settings.filters.deleteFailed'), e.message),
                }),
              )
            }
          />
        )}
      </View>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  keywordActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
});
