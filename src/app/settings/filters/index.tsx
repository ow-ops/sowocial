import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useFilters } from '@/api/ap/filters';
import { isUnsupported } from '@/api/ap/unsupported';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { intlLocale } from '@/i18n';

export default function Filters() {
  const { t } = useTranslation();
  const { data: filters, isPending, error, refetch } = useFilters();

  return (
    <SettingsScreen title={t('common.nav.filters')}>
      <Section title={t('settings.filters.title')}>
        <ThemedText type="meta">{t('settings.filters.intro')}</ThemedText>
        <QueryState
          pending={isPending}
          error={error}
          emptyText={filters?.length === 0 ? t('settings.filters.none') : undefined}
          onRetry={() => void refetch()}
        />
        {filters?.map((f) => {
          const expired = f.expiresAt ? new Date(f.expiresAt) < new Date() : false;
          return (
            <Row
              key={f.id}
              title={f.title}
              detail={[
                t('settings.filters.keywords', { count: f.keywords.length }),
                f.filterAction === 'hide' ? t('settings.filters.hidden') : t('settings.filters.collapsed'),
                expired
                  ? t('settings.filters.expired')
                  : f.expiresAt
                    ? t('settings.filters.until', { date: new Date(f.expiresAt).toLocaleDateString(intlLocale()) })
                    : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              chevron
              onPress={() => router.push({ pathname: '/settings/filters/[id]', params: { id: f.id } })}
            />
          );
        })}
      </Section>
      {!isUnsupported(error) && (
        <Button label={t('settings.filters.new')} onPress={() => router.push({ pathname: '/settings/filters/[id]', params: { id: 'new' } })} />
      )}
    </SettingsScreen>
  );
}
