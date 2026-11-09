import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useMutedAccounts, useUndoAccountModeration } from '@/api/accounts';
import { AccountRow } from '@/components/account-row';
import { ActionButton } from '@/components/action-row';
import { InfiniteList } from '@/components/infinite-list';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { intlLocale } from '@/i18n';
import type { Author } from '@/model/post';

// GoToSocial adds mute_expires_at to accounts in /api/v1/mutes (null when indefinite); masto's type omits it.
function muteExpiry(account: Author) {
  const at = account.protocol === 'ap' ? (account.raw?.ap as { muteExpiresAt?: string | null } | undefined)?.muteExpiresAt : null;
  if (!at) return null;
  return new Date(at).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MutedAccounts() {
  const { t } = useTranslation();
  const undo = useUndoAccountModeration('mutes');
  return (
    <InfiniteList
      title={t('settings.muted.title')}
      query={useMutedAccounts()}
      keyExtractor={(a) => a.id}
      renderItem={(a) => (
        <AccountRow
          account={a}
          trailing={
            <View style={styles.trailing}>
              {muteExpiry(a) && <ThemedText type="meta">{t('settings.muted.until', { date: muteExpiry(a) })}</ThemedText>}
              <ActionButton
                label={t('settings.muted.unmute')}
                accessibilityLabel={t('settings.muted.unmuteLabel', { acct: a.handle })}
                failedTitle={t('settings.muted.unmuteFailed')}
                run={(options) => undo.mutate(a.id, options)}
              />
            </View>
          }
        />
      )}
      emptyText={t('settings.muted.empty')}
    />
  );
}

const styles = StyleSheet.create({
  trailing: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
});
