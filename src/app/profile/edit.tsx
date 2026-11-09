import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import type { mastodon } from 'masto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { useCredentialAccount, useUpdateProfile } from '@/api/accounts';
import { useInstance } from '@/api/ap/instance';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ErrorView } from '@/components/error-view';
import { ProfileFieldsEditor } from '@/components/profile-fields-editor';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DEFAULT_MAX_FIELDS = 4;

export default function EditProfile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: account, isError, error, refetch } = useCredentialAccount();

  return (
    <>
      <Stack.Screen options={{ title: t('profile.editProfile.title') }} />
      {account ? (
        <EditForm account={account} />
      ) : isError ? (
        <ErrorView error={error} retry={async () => void (await refetch())} />
      ) : (
        <ActivityIndicator color={theme.muted} style={styles.loading} />
      )}
    </>
  );
}

async function pickImage(aspect: [number, number]) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect,
    quality: 0.8,
  });
  return result.canceled ? undefined : result.assets[0].uri;
}

function EditForm({ account }: { account: mastodon.v1.CredentialAccount }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const save = useUpdateProfile();
  const [displayName, setDisplayName] = useState(account.displayName);
  const [note, setNote] = useState(account.source.note);
  const [locked, setLocked] = useState(account.locked);
  const [bot, setBot] = useState(account.bot);
  const [fields, setFields] = useState(account.source.fields.map(({ name, value }) => ({ name, value })));
  const accountsConfig = useInstance().data?.configuration?.accounts as { maxProfileFields?: number } | undefined;
  const maxFields = Math.max(accountsConfig?.maxProfileFields ?? DEFAULT_MAX_FIELDS, fields.length);
  const [avatarUri, setAvatarUri] = useState<string>();
  const [headerUri, setHeaderUri] = useState<string>();


  const submit = () =>
    save.mutate(
      {
        displayName,
        note,
        locked,
        bot,
        fields: fields.filter((f) => f.name.trim() || f.value.trim()),
        avatarUri,
        headerUri,
      },
      { onSuccess: () => router.back() },
    );

  return (
    <SettingsScreen>
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('profile.editProfile.changeHeader')} onPress={async () => setHeaderUri((await pickImage([3, 1])) ?? headerUri)}>
          <Image
            source={headerUri ?? account.header}
            style={[styles.header, { backgroundColor: theme.surface }]}
            contentFit="cover"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.editProfile.changeAvatar')}
          style={[styles.avatar, { backgroundColor: theme.page }]}
          onPress={async () => setAvatarUri((await pickImage([1, 1])) ?? avatarUri)}>
          <Avatar uri={avatarUri ?? account.avatar} size={80} />
        </Pressable>
      </View>

      <Section title={t('profile.editProfile.displayName')}>
        <TextField
          value={displayName}
          onChangeText={setDisplayName}
          accessibilityLabel={t('profile.editProfile.displayName')}
        />
      </Section>

      <Section title={t('profile.editProfile.bio')}>
        <TextField
          value={note}
          onChangeText={setNote}
          accessibilityLabel={t('profile.editProfile.bio')}
          multiline
          style={styles.note}
        />
      </Section>

      <Section title={t('profile.editProfile.fields')}>
        <ProfileFieldsEditor fields={fields} max={maxFields} onChange={setFields} />
      </Section>

      <Section title={t('profile.editProfile.account')}>
        <Row
          title={t('profile.editProfile.lock')}
          role="switch"
          selected={locked}
          detail={t('profile.editProfile.lockDetail')}
          onPress={() => setLocked(!locked)}
          trailing={
            <Switch
              value={locked}
              onValueChange={setLocked}
              trackColor={{ true: theme.primary }}
              accessibilityLabel={t('profile.editProfile.lock')}
            />
          }
        />
        <Row
          title={t('profile.editProfile.bot')}
          role="switch"
          selected={bot}
          detail={t('profile.editProfile.botDetail')}
          onPress={() => setBot(!bot)}
          trailing={
            <Switch
              value={bot}
              onValueChange={setBot}
              trackColor={{ true: theme.primary }}
              accessibilityLabel={t('profile.editProfile.bot')}
            />
          }
        />
      </Section>

      {save.isError && (
        <ThemedText type="meta" themeColor="danger">
          {save.error.message}
        </ThemedText>
      )}
      <Button label={t('common.save')} loading={save.isPending} onPress={submit} />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    padding: Spacing.five,
  },
  header: {
    height: 120,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  avatar: {
    alignSelf: 'flex-start',
    marginLeft: Spacing.three,
    marginTop: -40,
    padding: 4,
    borderRadius: 44,
  },
  note: {
    minHeight: 100,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingVertical: Spacing.two,
    textAlignVertical: 'top',
  },
});
