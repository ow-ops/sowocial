import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useFollowRequest } from '@/api/accounts';
import { AccountRow } from '@/components/account-row';
import { Button } from '@/components/button';
import { Spacing } from '@/constants/theme';
import type { Author } from '@/model/post';
import { tapHaptic } from '@/utils/haptics';

export function FollowRequestRow({ account }: { account: Author }) {
  const { t } = useTranslation();
  const respond = useFollowRequest(account.id);
  const answer = (accept: boolean) => {
    tapHaptic();
    respond.mutate(accept);
  };
  return (
    <AccountRow
      account={account}
      trailing={
        <View style={styles.actions}>
          <Button
            label={t('notifications.followRequest.accept')}
            accessibilityLabel={t('profile.followRequests.acceptLabel', { acct: account.handle })}
            size="small"
            loading={respond.isPending && respond.variables}
            disabled={respond.isPending}
            onPress={() => answer(true)}
          />
          <Button
            label={t('notifications.followRequest.reject')}
            accessibilityLabel={t('profile.followRequests.rejectLabel', { acct: account.handle })}
            variant="outline"
            size="small"
            loading={respond.isPending && !respond.variables}
            disabled={respond.isPending}
            onPress={() => answer(false)}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.one,
  },
});
