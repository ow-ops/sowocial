import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { textStyles, ThemedText } from '@/components/themed-text';
import { frameless, Hairline, Press, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ProfileField = { name: string; value: string };

type Props = {
  fields: ProfileField[];
  max: number;
  onChange: (fields: ProfileField[]) => void;
};

export function ProfileFieldsEditor({ fields, max, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const update = (index: number, patch: Partial<ProfileField>) =>
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const [focused, setFocused] = useState<string | null>(null);
  const canAdd = fields.length < max;
  const divider = { borderColor: theme.border };
  const focusProps = (id: string) => ({
    onFocus: () => setFocused(id),
    onBlur: () => setFocused((current) => (current === id ? null : current)),
  });
  const focusStyle = (id: string) => focused === id && { backgroundColor: theme.page };
  const separator = <View style={[styles.separator, { backgroundColor: theme.border }]} />;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {fields.map((field, i) => (
        <View key={i}>
          {i > 0 && separator}
          <View style={styles.row}>
            <TextInput
              value={field.name}
              onChangeText={(name) => update(i, { name })}
              placeholder={t('profile.editProfile.fieldLabel')}
              placeholderTextColor={theme.muted}
              selectionColor={theme.primary}
              accessibilityLabel={t('profile.editProfile.fieldLabelA11y', { n: i + 1 })}
              {...focusProps(`${i}-name`)}
              style={[styles.input, styles.key, { color: theme.text }, divider, frameless, focusStyle(`${i}-name`)]}
            />
            <TextInput
              value={field.value}
              onChangeText={(value) => update(i, { value })}
              placeholder={t('profile.editProfile.fieldContent')}
              placeholderTextColor={theme.muted}
              selectionColor={theme.primary}
              accessibilityLabel={t('profile.editProfile.fieldContentA11y', { n: i + 1 })}
              autoCapitalize="none"
              {...focusProps(`${i}-value`)}
              style={[styles.input, styles.value, { color: theme.heading }, frameless, focusStyle(`${i}-value`)]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.editProfile.removeFieldA11y', { n: i + 1 })}
              hitSlop={Spacing.one}
              onPress={() => onChange(fields.filter((_, j) => j !== i))}
              style={({ pressed }) => [styles.remove, pressed && { opacity: Press.opacity }]}>
              <SymbolView
                name={{ ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' }}
                size={20}
                tintColor={theme.danger}
              />
            </Pressable>
          </View>
        </View>
      ))}
      {canAdd && fields.length > 0 && separator}
      {canAdd && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.editProfile.addField')}
          accessibilityHint={t('profile.editProfile.fieldsCount', { count: fields.length, max })}
          onPress={() => onChange([...fields, { name: '', value: '' }])}
          style={({ pressed }) => [styles.row, styles.add, pressed && { opacity: Press.opacity }]}>
          <SymbolView name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }} size={20} tintColor={theme.primary} />
          <ThemedText type="label" themeColor="primary" style={styles.addLabel}>
            {t('profile.editProfile.addField')}
          </ThemedText>
          <ThemedText type="meta">{t('profile.editProfile.fieldsCount', { count: fields.length, max })}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  separator: {
    height: Hairline,
    marginLeft: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TouchTarget,
  },
  input: {
    ...textStyles.input,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
  },
  key: {
    width: '36%',
    maxWidth: 200,
    borderRightWidth: Hairline,
  },
  value: {
    flex: 1,
  },
  remove: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  addLabel: {
    flex: 1,
  },
});
