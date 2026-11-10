import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAnnouncements } from '@/api/ap/announcements';
import { useInstance } from '@/api/ap/instance';
import { Avatar } from '@/components/avatar';
import { ErrorView } from '@/components/error-view';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { StatusContent } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { htmlContent } from '@/model/content';
import { openLink } from '@/utils/open-link';

export default function ServerScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('common.nav.aboutServer') }} />
      <ServerDetails />
    </>
  );
}

function ServerDetails() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data, error, refetch } = useInstance();
  const announcements = useAnnouncements().data ?? [];

  if (error) return <ErrorView error={error} retry={async () => void (await refetch())} />;
  if (!data) {
    return (
      <SettingsScreen>
        <ActivityIndicator color={theme.primary} accessibilityLabel={t('settings.server.loading')} />
      </SettingsScreen>
    );
  }

  // GoToSocial sends terms as HTML; masto's typings do not list it.
  const terms = (data as typeof data & { terms?: string }).terms;
  const { contact, registrations, rules } = data;
  const registration = !registrations.enabled
    ? t('settings.server.registrationClosed')
    : registrations.approvalRequired
      ? t('settings.server.registrationReview')
      : t('settings.server.registrationOpen');

  return (
    <SettingsScreen>
      <View style={styles.intro}>
        <ThemedText type="display">{data.title}</ThemedText>
        <ThemedText type="meta">{data.domain}</ThemedText>
      </View>

      {data.description ? (
        <Section title={t('settings.server.about')}>
          <StatusContent content={htmlContent(data.description)} />
        </Section>
      ) : null}

      {rules.length > 0 && (
        <Section title={t('settings.server.rules')}>
          <View style={styles.rules}>
            {rules.map((rule, i) => (
              <View key={rule.id} style={styles.rule}>
                <ThemedText type="name" themeColor="primary" style={styles.number}>
                  {i + 1}.
                </ThemedText>
                <ThemedText style={styles.ruleText}>{rule.text}</ThemedText>
              </View>
            ))}
          </View>
        </Section>
      )}

      {announcements.length > 0 && (
        <Section title={t('announcements.title')}>
          <Row
            title={t('announcements.count', { count: announcements.length })}
            chevron
            onPress={() => router.push('/settings/announcements')}
          />
        </Section>
      )}

      <Section title={t('settings.server.signUps')}>
        <Row title={registration} />
        {registrations.message ? <StatusContent content={htmlContent(registrations.message)} /> : null}
      </Section>

      {(contact?.account || contact?.email) && (
        <Section title={t('settings.server.contact')}>
          {contact.account && (
            <Row
              title={contact.account.displayName || contact.account.username}
              detail={`@${contact.account.acct}`}
              leading={<Avatar uri={contact.account.avatar} size={40} />}
              chevron
              onPress={() => router.push({ pathname: '/account/[id]', params: { id: contact.account.id } })}
            />
          )}
          {contact.email ? (
            <Row title={contact.email} detail={t('settings.server.email')} onPress={() => openLink(`mailto:${contact.email}`)} />
          ) : null}
        </Section>
      )}

      {terms ? (
        <Section title={t('settings.server.terms')}>
          <StatusContent content={htmlContent(terms)} />
        </Section>
      ) : null}

      <Section title={t('settings.server.software')}>
        <Row title={`GoToSocial ${data.version}`} />
        {data.sourceUrl ? (
          <Row title={t('settings.server.sourceCode')} detail={data.sourceUrl} onPress={() => openLink(data.sourceUrl)} />
        ) : null}
      </Section>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  rules: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rule: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  number: {
    minWidth: 24,
    fontVariant: ['tabular-nums'],
  },
  ruleText: {
    flex: 1,
  },
});
