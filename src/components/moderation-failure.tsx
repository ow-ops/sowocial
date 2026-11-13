import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { lacksModerationScopes } from '@/api/ap/moderation';
import { Button } from '@/components/button';
import { QueryState } from '@/components/query-state';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useGrantModeration } from '@/auth/use-reconnect';

type Props = Parameters<typeof QueryState>[0];

export function ModerationState({ error, ...props }: Props) {
  if (lacksModerationScopes(error)) return <ModerationGrant />;
  return <QueryState error={error} {...props} />;
}

function ModerationGrant() {
  const { t } = useTranslation();
  const grant = useGrantModeration();
  return (
    <View style={styles.container}>
      <ThemedText>{t('moderation.needsScopes')}</ThemedText>
      <Button label={t('moderation.grant')} loading={grant.isPending} onPress={() => grant.mutate()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
