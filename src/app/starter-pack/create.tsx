import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';

import { graphemesLeft, nearLimit, STARTER_PACK_MAX, useCreateStarterPack } from '@/api/bsky/starter-packs';
import { Button } from '@/components/button';
import { Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { showError } from '@/utils/toast';

function Counter({ left, max }: { left: number; max: number }) {
  const { t } = useTranslation();
  if (!nearLimit(left, max)) return null;
  return (
    <ThemedText
      type="meta"
      themeColor={left < 0 ? 'danger' : 'muted'}
      accessibilityLabel={t('compose.options.charactersLeft', { count: left })}
      accessibilityLiveRegion="polite"
      style={styles.counter}>
      {left}
    </ThemedText>
  );
}

export default function CreateStarterPackScreen() {
  const { t } = useTranslation();
  const create = useCreateStarterPack();
  const descriptionRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameLeft = graphemesLeft(name, STARTER_PACK_MAX.name);
  const descriptionLeft = graphemesLeft(description, STARTER_PACK_MAX.description);
  const valid = !!name.trim() && nameLeft >= 0 && descriptionLeft >= 0;

  const submit = () => {
    if (!valid) return;
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: (id) => router.replace({ pathname: '/starter-pack/[id]', params: { id } }),
        onError: (e) => showError(t('profile.starterPacks.createFailed'), e.message),
      },
    );
  };

  return (
    <SettingsScreen title={t('profile.starterPacks.newTitle')}>
      <Section title={t('profile.starterPacks.nameSection')}>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder={t('profile.starterPacks.namePlaceholder')}
          accessibilityLabel={t('profile.starterPacks.namePlaceholder')}
          returnKeyType="next"
          onSubmitEditing={() => descriptionRef.current?.focus()}
        />
        <Counter left={nameLeft} max={STARTER_PACK_MAX.name} />
      </Section>
      <Section title={t('profile.starterPacks.descriptionSection')}>
        <TextField
          ref={descriptionRef}
          value={description}
          onChangeText={setDescription}
          placeholder={t('profile.starterPacks.descriptionPlaceholder')}
          accessibilityLabel={t('profile.starterPacks.descriptionPlaceholder')}
          multiline
          style={styles.description}
        />
        <Counter left={descriptionLeft} max={STARTER_PACK_MAX.description} />
      </Section>
      <Button label={t('profile.starterPacks.create')} loading={create.isPending} disabled={!valid} onPress={submit} />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  description: {
    minHeight: 100,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingVertical: Spacing.two,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.three,
  },
});
